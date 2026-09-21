using System.Diagnostics;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>What one JS interop function did since the circuit (or page) started: how often it was called, how long it took, how often it threw.</summary>
public sealed record PkInteropCall(string Identifier, long Calls, double TotalMs, double MaxMs, long Errors)
{
    /// <summary>The mean duration of a call, in milliseconds.</summary>
    public double AverageMs => Calls == 0 ? 0 : Math.Round(TotalMs / Calls, 1);
}

/// <summary>A JS interop call that threw.</summary>
public sealed record PkInteropError(DateTimeOffset At, string Identifier, string Type, string Message);

/// <summary>A copy of <see cref="PkInteropLog"/> at one moment.</summary>
public sealed record PkInteropSnapshot(long Calls, long Errors, IReadOnlyList<PkInteropCall> ByIdentifier, IReadOnlyList<PkInteropError> RecentErrors);

/// <summary>
/// The calls PlainKit.Blazor made into its JavaScript bridge (<c>PkRuntime.BridgeAsync</c>) on this circuit or page: count, duration and errors per
/// function. It sees only what goes through the bridge; a call an app makes on its own <c>IJSRuntime</c> is not counted. Durations include the network
/// round trip on Blazor Server. Registered by <c>AddPlainKit</c>.
/// </summary>
public sealed class PkInteropLog
{
    /// <summary>How many failed calls are kept (the newest).</summary>
    public const int MaxErrors = 20;

    private readonly object _gate = new();
    private readonly Dictionary<string, (long Calls, double TotalMs, double MaxMs, long Errors)> _byIdentifier = new();
    private readonly Queue<PkInteropError> _errors = new();
    private long _calls;
    private long _failed;

    internal void Record(string identifier, double ms, Exception? error)
    {
        lock (_gate)
        {
            _calls++;
            _byIdentifier.TryGetValue(identifier, out var s);
            s = (s.Calls + 1, s.TotalMs + ms, Math.Max(s.MaxMs, ms), s.Errors + (error is null ? 0 : 1));
            _byIdentifier[identifier] = s;
            if (error is null) return;
            _failed++;
            _errors.Enqueue(new PkInteropError(DateTimeOffset.UtcNow, identifier, error.GetType().Name, error.Message));
            while (_errors.Count > MaxErrors) _errors.Dequeue();
        }
    }

    /// <summary>The counts so far. The function with the most total time comes first.</summary>
    public PkInteropSnapshot Snapshot()
    {
        lock (_gate)
        {
            return new PkInteropSnapshot(_calls, _failed,
                [.. _byIdentifier.Select(kv => new PkInteropCall(kv.Key, kv.Value.Calls, Math.Round(kv.Value.TotalMs, 1), Math.Round(kv.Value.MaxMs, 1), kv.Value.Errors)).OrderByDescending(c => c.TotalMs)],
                [.. _errors]);
        }
    }
}

/// <summary>Wraps the bridge module so every call is timed and its failure recorded, then passes it on unchanged.</summary>
internal sealed class PkTrackedBridge(IJSObjectReference inner, PkInteropLog log) : IJSObjectReference
{
    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) => Track(identifier, () => inner.InvokeAsync<TValue>(identifier, args));

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args) =>
        Track(identifier, () => inner.InvokeAsync<TValue>(identifier, cancellationToken, args));

    public ValueTask DisposeAsync() => inner.DisposeAsync();

    private async ValueTask<TValue> Track<TValue>(string identifier, Func<ValueTask<TValue>> call)
    {
        var start = Stopwatch.GetTimestamp();
        Exception? error = null;
        try { return await call(); }
        catch (Exception e) { error = e; throw; }
        finally { log.Record(identifier, Stopwatch.GetElapsedTime(start).TotalMilliseconds, error); }
    }
}
