using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>
/// Loads the toolkit's JavaScript on demand. Register with <c>services.AddPlainKit()</c>; components call it, an app rarely does.
/// </summary>
public sealed class PkRuntime(IJSRuntime js) : IAsyncDisposable
{
    private readonly Lazy<Task<IJSObjectReference>> _bridge = new(() => js.InvokeAsync<IJSObjectReference>("import", PkAssets.Bridge).AsTask());
    private Task? _init;

    /// <summary>Wires the <c>pk-*</c> elements and behaviours for the page once, however many components ask.</summary>
    public Task EnsureInitializedAsync() => _init ??= InitAsync();

    private async Task InitAsync() => await (await _bridge.Value).InvokeVoidAsync("init");

    internal async ValueTask<IJSObjectReference> BridgeAsync() => await _bridge.Value;

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (!_bridge.IsValueCreated) return;
        try { await (await _bridge.Value).DisposeAsync(); }
        catch (JSDisconnectedException) { /* the circuit is gone; nothing to release */ }
    }
}
