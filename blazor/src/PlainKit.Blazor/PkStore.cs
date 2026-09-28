using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlainKit.Blazor;

/// <summary>What a store key may hold beyond the type of its default: allowed values, a numeric range and a length cap (of the value as JSON, default 1024).</summary>
public sealed record PkStoreRule(IReadOnlyList<object>? Allowed = null, double? Min = null, double? Max = null, int MaxLength = 1024);

/// <summary>
/// The declaration of one store module, the C# form of the JavaScript <c>createStore().module(id, spec)</c> spec (js/store.js). Values are strings, booleans or
/// numbers; the type of a key is the type of its default.
/// </summary>
public sealed class PkStoreSpec
{
    /// <summary>The version written with the data. Stored data of another version falls back to the defaults (there is no migration hook yet).</summary>
    public int Version { get; init; } = 1;
    /// <summary>Every key of the module with its default. Keys outside this list are refused.</summary>
    public IReadOnlyDictionary<string, object?> Defaults { get; init; } = new Dictionary<string, object?>();
    /// <summary>The keys written to browser storage; the rest stay in memory.</summary>
    public IReadOnlyList<string> Persist { get; init; } = [];
    /// <summary>The keys other modules can see through <see cref="IPkStore.Read"/>.</summary>
    public IReadOnlyList<string> Publish { get; init; } = [];
    /// <summary>Extra rules per key.</summary>
    public IReadOnlyDictionary<string, PkStoreRule> Rules { get; init; } = new Dictionary<string, PkStoreRule>();
    internal bool OpenKeys { get; init; }
}

/// <summary>One module's state. Get it from <see cref="IPkStore.OpenAsync"/>; dispose it to free its name and its subscriptions.</summary>
public interface IPkStoreModule : IAsyncDisposable
{
    /// <summary>The value of a key (its default when never set); null for a key the module does not have.</summary>
    object? Get(string key);
    /// <summary>The value converted to <typeparamref name="T"/>, or <paramref name="fallback"/> when missing or not convertible.</summary>
    T Get<T>(string key, T fallback);
    /// <summary>Sets a key; false (and one warning) instead of an exception when the key is unknown or the value invalid.</summary>
    ValueTask<bool> SetAsync(string key, object? value);
    /// <summary>Back to the defaults, saved as such.</summary>
    ValueTask ResetAsync();
    /// <summary>Raised with the whole state after it changed.</summary>
    event Action<IReadOnlyDictionary<string, object?>>? Changed;
}

/// <summary>
/// Namespaced, versioned, validated state over browser storage (the Blazor side of js/store.js). Persisted as JSON <c>{"v":1,"data":{...}}</c> under
/// <c>pk.&lt;moduleId&gt;</c>, the same envelope and key format as the JavaScript store, so a JavaScript app and a Blazor app on one origin read each other's data.
/// Stored data is untrusted: corrupt, oversized (64 KB), wrong-type, unknown-key or other-version data gives the defaults and one warning, never an exception.
/// Storage that is unavailable (prerendering, blocked, full) keeps the state in memory. Keep secrets out: this is plain <c>localStorage</c>.
/// Open modules from <c>OnAfterRenderAsync(firstRender)</c>: nothing reaches JavaScript before that.
/// </summary>
public interface IPkStore : IAsyncDisposable
{
    /// <summary>Opens the module <paramref name="id"/> (lowercase letters, digits, <c>_</c> and <c>-</c>, up to 40). A bad or taken id throws: it is a code mistake.</summary>
    ValueTask<IPkStoreModule> OpenAsync(string id, PkStoreSpec spec);
    /// <summary>Another module's published keys as a read-only copy (empty when none or unknown).</summary>
    IReadOnlyDictionary<string, object?> Read(string id);
}

internal sealed partial class PkStore(IPkStorage storage) : IPkStore
{
    internal const string Prefix = "pk";
    private const int MaxStored = 65536;
    [GeneratedRegex(@"^[a-z][\w-]{0,39}$")] private static partial Regex IdPattern();
    [GeneratedRegex(@"^[a-z][\w.-]{0,39}$")] private static partial Regex KeyPattern();
    private readonly Dictionary<string, Module> _modules = [];
    private IPkStorage Storage => storage;

    public async ValueTask<IPkStoreModule> OpenAsync(string id, PkStoreSpec spec)
    {
        if (!IdPattern().IsMatch(id ?? "") || _modules.ContainsKey(id!)) throw new ArgumentException("bad or taken module id", nameof(id));
        var module = new Module(this, id!, spec);
        _modules[id!] = module;
        module.Load(await storage.GetAsync($"{Prefix}.{id}"));
        return module;
    }

    public IReadOnlyDictionary<string, object?> Read(string id) =>
        new ReadOnlyDictionary<string, object?>(_modules.TryGetValue(id ?? "", out var m) ? m.Published() : []);

    public ValueTask DisposeAsync()
    {
        foreach (var m in _modules.Values.ToList()) m.Free();
        return ValueTask.CompletedTask;
    }

    // Strings, booleans and finite numbers only; everything else is not storable.
    internal static bool TryNormalize(object? v, out object? value)
    {
        value = v switch
        {
            string or bool => v,
            double or float or decimal or int or long or short or byte or uint or ulong or ushort => Convert.ToDouble(v, CultureInfo.InvariantCulture),
            _ => null
        };
        return value is string or bool || value is double d && double.IsFinite(d);
    }

    private static bool SameKind(object? a, object? b) => a switch { string => b is string, bool => b is bool, double => b is double, _ => false };

    private sealed class Module : IPkStoreModule
    {
        private readonly PkStore _owner;
        private readonly string _id, _ns;
        private readonly PkStoreSpec _spec;
        private readonly Dictionary<string, object?> _defaults = [];
        private Dictionary<string, object?> _data;
        private bool _live = true;

        public Module(PkStore owner, string id, PkStoreSpec spec)
        {
            (_owner, _id, _ns, _spec) = (owner, id, $"{Prefix}.{id}", spec);
            foreach (var (k, v) in spec.Defaults)
                _defaults[k] = TryNormalize(v, out var n) ? n : throw new ArgumentException($"the default of {k} is not a string, boolean or number");
            _data = new(_defaults);
        }

        public event Action<IReadOnlyDictionary<string, object?>>? Changed;

        private bool Persists(string key) => _spec.OpenKeys || _spec.Persist.Contains(key);

        private bool Valid(string key, object? v)
        {
            if (!TryNormalize(v, out var n)) return false;
            if (_defaults.TryGetValue(key, out var d)) { if (!SameKind(n, d)) return false; }
            else if (!_spec.OpenKeys || !KeyPattern().IsMatch(key) || _data.Count >= 64) return false;
            var rule = _spec.Rules.GetValueOrDefault(key);
            if (rule?.Allowed is { } allowed && !allowed.Any(a => TryNormalize(a, out var an) && Equals(an, n))) return false;
            if (n is double x && (x < rule?.Min || x > rule?.Max)) return false;
            return JsonSerializer.Serialize(n).Length <= (rule?.MaxLength ?? 1024);
        }

        // Replaces the state from untrusted stored text; a wrong key gets its default, with ONE warning.
        internal void Load(string? raw)
        {
            var next = new Dictionary<string, object?>(_defaults);
            var why = new List<string>();
            if (raw is not null)
            {
                try
                {
                    if (raw.Length > MaxStored) throw new JsonException();
                    using var doc = JsonDocument.Parse(raw);
                    var root = doc.RootElement;
                    if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("v", out var v) || !v.TryGetInt32(out var ver) || ver != _spec.Version
                        || !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object) throw new JsonException();
                    foreach (var p in data.EnumerateObject())
                    {
                        object? val = p.Value.ValueKind switch { JsonValueKind.String => p.Value.GetString(), JsonValueKind.True => true, JsonValueKind.False => false, JsonValueKind.Number => p.Value.GetDouble(), _ => null };
                        if (!Persists(p.Name)) why.Add($"unknown {p.Name}");
                        else if (val is not null && Valid(p.Name, val)) next[p.Name] = val;
                        else why.Add($"invalid {p.Name}");
                    }
                }
                catch (Exception e) when (e is JsonException or InvalidOperationException) { why.Add("unusable data"); }
            }
            if (why.Count > 0) _owner.Storage.Warn($"{_ns}: {string.Join(", ", why)}; defaults used");
            Put(next);
        }

        private void Put(Dictionary<string, object?> next)
        {
            if (JsonSerializer.Serialize(_data.OrderBy(k => k.Key)) == JsonSerializer.Serialize(next.OrderBy(k => k.Key))) return;
            _data = next;
            var copy = new ReadOnlyDictionary<string, object?>(new Dictionary<string, object?>(_data));
            foreach (var fn in Changed?.GetInvocationList().Cast<Action<IReadOnlyDictionary<string, object?>>>() ?? [])
            {
                try { fn(copy); }
                catch (Exception e) { _owner.Storage.Warn($"{_ns}: a subscriber failed: {e.Message}"); }
            }
        }

        private ValueTask Save()
        {
            var keep = _data.Where(k => Persists(k.Key)).ToDictionary(k => k.Key, k => k.Value);
            return keep.Count == 0 ? ValueTask.CompletedTask : _owner.Storage.SetAsync(_ns, JsonSerializer.Serialize(new { v = _spec.Version, data = keep }));
        }

        internal Dictionary<string, object?> Published() => _spec.Publish.Where(_data.ContainsKey).ToDictionary(k => k, k => _data[k]);

        public object? Get(string key) => _data.GetValueOrDefault(key);

        public T Get<T>(string key, T fallback)
        {
            if (!_data.TryGetValue(key, out var v) || v is null) return fallback;
            try { return (T)Convert.ChangeType(v, Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T), CultureInfo.InvariantCulture); }
            catch (Exception e) when (e is InvalidCastException or FormatException or OverflowException) { return fallback; }
        }

        public async ValueTask<bool> SetAsync(string key, object? value)
        {
            if (!_live || !Valid(key, value)) { _owner.Storage.Warn($"{_ns}: rejected {key}"); return false; }
            TryNormalize(value, out var n);
            Put(new(_data) { [key] = n });
            await Save();
            return true;
        }

        public async ValueTask ResetAsync()
        {
            if (!_live) return;
            Put(new(_defaults));
            await Save();
        }

        internal void Free() { _live = false; Changed = null; _owner._modules.Remove(_id); }

        public ValueTask DisposeAsync() { Free(); return ValueTask.CompletedTask; }
    }
}
