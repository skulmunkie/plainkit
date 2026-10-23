using Microsoft.JSInterop;

namespace PlainKit.Blazor;

public sealed partial class PkOptions
{
    /// <summary>Turns the themed reconnect banner on for <c>PkApp</c> and sets how it behaves. Null, the default, leaves the framework's own reconnect dialog; an app that places <c>PkReconnect</c> itself can leave this null.</summary>
    public PkReconnectOptions? Reconnect { get; set; }
}

public sealed partial class PkRuntime
{
    /// <summary>Starts the reconnect banner in the browser (idempotent): <paramref name="options"/>, else <see cref="PkOptions.Reconnect"/>; with neither, nothing. A page without a circuit has no one to call.</summary>
    internal async Task StartReconnectAsync(PkReconnectOptions? options = null)
    {
        if ((options ?? _options.Reconnect) is not { } o) return;
        try { await (await BridgeAsync()).InvokeVoidAsync("startReconnect", o.ToJson()); }
        catch (Exception e) when (e is JSDisconnectedException or InvalidOperationException or OperationCanceledException or JSException)
        {
            // no circuit to call: the banner is not started
        }
    }

    internal async Task StopReconnectAsync()
    {
        try { await (await BridgeAsync()).InvokeVoidAsync("stopReconnect"); }
        catch (Exception e) when (e is JSDisconnectedException or InvalidOperationException or OperationCanceledException or JSException)
        {
            // the circuit is gone: nothing to stop
        }
    }
}
