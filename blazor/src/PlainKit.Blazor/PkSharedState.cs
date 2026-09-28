using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

// Browser storage for the store: the bridge's storageGet/storageSet, with memory as the fallback (prerender, blocked or full storage), one warning.
internal interface IPkStorage
{
    ValueTask<string?> GetAsync(string key);
    ValueTask SetAsync(string key, string value);
    void Warn(string message);
}

internal sealed class PkStorage(PkRuntime runtime, IPkLog? log = null, ILoggerFactory? loggerFactory = null) : IPkStorage
{
    private readonly Dictionary<string, string> _memory = [];
    private bool _told;

    internal static bool Unavailable(Exception e) => e is JSException or JSDisconnectedException or InvalidOperationException or OperationCanceledException or ObjectDisposedException;

    public async ValueTask<string?> GetAsync(string key)
    {
        if (_memory.TryGetValue(key, out var kept)) return kept;
        try { return await (await runtime.BridgeAsync()).InvokeAsync<string?>("storageGet", key); }
        catch (Exception e) when (Unavailable(e)) { TellOnce(e); return null; }
    }

    public async ValueTask SetAsync(string key, string value)
    {
        if (!_memory.ContainsKey(key))
        {
            try { await (await runtime.BridgeAsync()).InvokeVoidAsync("storageSet", key, value); return; }
            catch (Exception e) when (Unavailable(e)) { TellOnce(e); }
        }
        _memory[key] = value;
    }

    private void TellOnce(Exception e)
    {
        if (_told) return;
        _told = true;
        Warn($"browser storage is unavailable; the state is kept in memory ({e.GetType().Name})");
    }

    public void Warn(string message)
    {
        loggerFactory?.CreateLogger(PkLogMapping.Category("store")).LogWarning("{PkMessage}", message);
        if (log is null) return;
        _ = WriteAsync(message);
    }

    private async Task WriteAsync(string message)
    {
        try { await log!.WriteAsync(PkLogLevel.Warn, "store", message); }
        catch (Exception e) when (Unavailable(e)) { /* no page to log to (prerender): ILogger has it */ }
    }
}

/// <summary>
/// Typed settings by module (the Blazor side of js/settings.js, on the store). A module's settings persist under <c>pk.settings-&lt;module&gt;</c> as scalar
/// values (string, boolean, number); a stored value of another type, corrupt data or unavailable storage gives the fallback you pass, never an exception.
/// </summary>
public interface IPkSettings
{
    /// <summary>The setting, or <paramref name="fallback"/> when unset or invalid.</summary>
    ValueTask<T> GetAsync<T>(string module, string key, T fallback);
    /// <summary>Saves a setting; false when the module or key name is invalid or the value is not a string, boolean or number.</summary>
    ValueTask<bool> SetAsync(string module, string key, object value);
}

internal sealed class PkSettings(IPkStore store) : IPkSettings
{
    private readonly Dictionary<string, IPkStoreModule> _open = [];

    private async ValueTask<IPkStoreModule?> ModuleAsync(string module)
    {
        if (module is not null && _open.TryGetValue(module, out var m)) return m;
        try { return _open[module!] = await store.OpenAsync($"settings-{module}", new PkStoreSpec { OpenKeys = true }); }
        catch (ArgumentException) { return null; }
    }

    public async ValueTask<T> GetAsync<T>(string module, string key, T fallback) => await ModuleAsync(module) is { } m ? m.Get(key, fallback) : fallback;

    public async ValueTask<bool> SetAsync(string module, string key, object value) => await ModuleAsync(module) is { } m && await m.SetAsync(key, value);
}

/// <summary>The colour theme, persisted (<c>pk.theme</c>) and applied as <c>data-theme</c> on the document element. Call <see cref="InitializeAsync"/> from <c>OnAfterRenderAsync(firstRender)</c>.</summary>
public interface IPkTheme
{
    /// <summary><c>light</c> or <c>dark</c> (dark until <see cref="InitializeAsync"/> read the stored choice).</summary>
    string Current { get; }
    /// <summary>Raised with the new theme after it changed.</summary>
    event Action<string>? Changed;
    /// <summary>Reads the stored theme and applies it. Safe to call again.</summary>
    ValueTask InitializeAsync();
    /// <summary>Sets and saves the theme; false for anything but <c>light</c> or <c>dark</c>.</summary>
    ValueTask<bool> SetAsync(string theme);
    /// <summary>Switches between light and dark.</summary>
    ValueTask ToggleAsync();
}

internal sealed class PkThemeService(IPkStore store, PkRuntime runtime, IPkStorage storage) : IPkTheme
{
    private static readonly PkStoreSpec Spec = new()
    {
        Defaults = new Dictionary<string, object?> { ["theme"] = "dark" },
        Persist = ["theme"],
        Publish = ["theme"],
        Rules = new Dictionary<string, PkStoreRule> { ["theme"] = new(Allowed: ["light", "dark"]) }
    };
    private IPkStoreModule? _module;

    public string Current => _module?.Get("theme", "dark") ?? "dark";
    public event Action<string>? Changed;

    public async ValueTask InitializeAsync()
    {
        if (_module is null)
        {
            _module = await store.OpenAsync("theme", Spec);
            _module.Changed += state => Changed?.Invoke((string)state["theme"]!);
        }
        await ApplyAsync();
    }

    public async ValueTask<bool> SetAsync(string theme)
    {
        await InitializeAsync();
        if (!await _module!.SetAsync("theme", theme)) return false;
        await ApplyAsync();
        return true;
    }

    public async ValueTask ToggleAsync()
    {
        await InitializeAsync();
        await SetAsync(Current == "dark" ? "light" : "dark");
    }

    private async ValueTask ApplyAsync()
    {
        try { await (await runtime.BridgeAsync()).InvokeVoidAsync("applyTheme", Current); }
        catch (Exception e) when (PkStorage.Unavailable(e)) { storage.Warn($"the theme was not applied to the page ({e.GetType().Name})"); }
    }
}
