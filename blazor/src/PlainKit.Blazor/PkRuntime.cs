using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>
/// Loads the toolkit's JavaScript on demand. Register with <c>services.AddPlainKit()</c>; components call it, an app rarely does.
/// </summary>
public sealed class PkRuntime(IJSRuntime js, PkOptions? options = null, ILoggerFactory? loggerFactory = null) : IAsyncDisposable
{
    private readonly Lazy<Task<IJSObjectReference>> _bridge = new(() => js.InvokeAsync<IJSObjectReference>("import", PkAssets.Bridge).AsTask());
    private readonly PkOptions _options = options ?? new PkOptions();
    private Task? _init;
    private Task? _logging;
    private DotNetObjectReference<PkLogForwarder>? _forwarder;

    /// <summary>Wires the <c>pk-*</c> elements and behaviours for the page once, however many components ask.</summary>
    public Task EnsureInitializedAsync() => _init ??= InitAsync();

    private async Task InitAsync()
    {
        await EnsureLoggingAsync();
        await (await _bridge.Value).InvokeVoidAsync("init");
    }

    /// <summary>Applies <see cref="PkOptions.Logging"/> to the SDK logger and starts the <see cref="ILogger"/> forwarder, once.</summary>
    internal Task EnsureLoggingAsync() => _logging ??= LoggingAsync();

    private async Task LoggingAsync()
    {
        var bridge = await _bridge.Value;
        var logging = _options.Logging;
        if (PkLogMapping.ToConfig(logging) is { } config) await bridge.InvokeVoidAsync("configureLogging", config);
        if (logging.ForwardToILogger && loggerFactory is not null)
        {
            _forwarder = DotNetObjectReference.Create(new PkLogForwarder(loggerFactory, logging));
            await bridge.InvokeVoidAsync("startLogForwarding", _forwarder, PkLogMapping.Name(logging.ForwardMinimumLevel));
        }
    }

    internal async ValueTask<IJSObjectReference> BridgeAsync() => await _bridge.Value;

    /// <summary>The version of the Plainkit JavaScript the page loaded (<c>PK_VERSION</c> in <c>js/version.js</c>). It equals <see cref="PkAssets.Version"/> unless the app serves an older or newer copy of the assets.</summary>
    public async ValueTask<string> GetSdkVersionAsync() => await (await _bridge.Value).InvokeAsync<string>("version");

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (!_bridge.IsValueCreated) return;
        try
        {
            var bridge = await _bridge.Value;
            if (_forwarder is not null) await bridge.InvokeVoidAsync("stopLogForwarding");
            await bridge.DisposeAsync();
        }
        catch (Exception e) when (e is JSDisconnectedException or InvalidOperationException or ObjectDisposedException or OperationCanceledException)
        {
            // the circuit is gone, or this scope was a prerender (no JavaScript ever): nothing to release
        }
        finally
        {
            _forwarder?.Dispose();
            _forwarder = null;
        }
    }
}
