using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>
/// Loads the toolkit's JavaScript on demand. Register with <c>services.AddPlainKit()</c>; components call it, an app rarely does.
/// </summary>
public sealed class PkRuntime(IJSRuntime js, PkOptions? options = null, ILoggerFactory? loggerFactory = null, PkInteropLog? interop = null) : IAsyncDisposable
{
    private Task<IJSObjectReference>? _bridge;
    private readonly PkInteropLog _interop = interop ?? new PkInteropLog();
    private readonly PkOptions _options = options ?? new PkOptions();
    private Task? _init;
    private Task? _logging;
    private DotNetObjectReference<PkLogForwarder>? _forwarder;

    // The bridge is wrapped so the calls PlainKit.Blazor makes into it are counted and timed (PkInteropLog); the import itself is not a bridge call.
    private Task<IJSObjectReference> Bridge => _bridge ??= ImportAsync();

    private async Task<IJSObjectReference> ImportAsync() => new PkTrackedBridge(await js.InvokeAsync<IJSObjectReference>("import", PkAssets.Bridge), _interop);

    /// <summary>The calls made through the bridge so far: count, duration and errors per function.</summary>
    public PkInteropLog Interop => _interop;

    /// <summary>True once <see cref="EnsureInitializedAsync"/> has finished.</summary>
    public bool IsInitialized => _init is { IsCompletedSuccessfully: true };

    /// <summary>Wires the <c>pk-*</c> elements and behaviours for the page once, however many components ask.</summary>
    public Task EnsureInitializedAsync() => _init ??= InitAsync();

    private async Task InitAsync()
    {
        await EnsureLoggingAsync();
        var bridge = await Bridge;
        await WarnOnVersionMismatchAsync(bridge);
        await bridge.InvokeVoidAsync("init");
    }

    // The package and the JavaScript it serves are one version (core/VERSION). A page that loads a different copy (a stale cache, a CDN or self-hosted copy of
    // core/dist) gets the mismatch as one warning per runtime, in the SDK log (the logs viewer) and in ILogger. Never a failure: the check must not break startup.
    private async Task WarnOnVersionMismatchAsync(IJSObjectReference bridge)
    {
        var logger = loggerFactory?.CreateLogger(PkLogMapping.Category("blazor"));
        try
        {
            var sdk = await bridge.InvokeAsync<string?>("version");
            if (string.IsNullOrEmpty(sdk) || sdk == PkAssets.Version) return;
            var message = $"PlainKit.Blazor {PkAssets.Version} is running with the Plainkit JavaScript {sdk}: the versions differ, so components and elements may not match. Serve the JavaScript that ships in the package (the static web assets under _content/PlainKit.Blazor/plainkit/), and clear a stale cache or a CDN copy.";
            logger?.LogWarning("{PkMessage}", message);
            await bridge.InvokeVoidAsync("writeLog", "warn", "blazor", message, $"{{\"package\":\"{PkAssets.Version}\",\"javascript\":\"{sdk}\"}}");
        }
        catch (Exception e) when (e is JSException or JSDisconnectedException or InvalidOperationException or OperationCanceledException or ObjectDisposedException)
        {
            logger?.LogDebug(e, "Could not compare the Plainkit JavaScript version with the package version");
        }
    }

    /// <summary>Applies <see cref="PkOptions.Logging"/> to the SDK logger and starts the <see cref="ILogger"/> forwarder, once.</summary>
    internal Task EnsureLoggingAsync() => _logging ??= LoggingAsync();

    private async Task LoggingAsync()
    {
        var bridge = await Bridge;
        var logging = _options.Logging;
        if (PkLogMapping.ToConfig(logging) is { } config) await bridge.InvokeVoidAsync("configureLogging", config);
        if (logging.ForwardToILogger && loggerFactory is not null)
        {
            _forwarder = DotNetObjectReference.Create(new PkLogForwarder(loggerFactory, logging));
            await bridge.InvokeVoidAsync("startLogForwarding", _forwarder, PkLogMapping.Name(logging.ForwardMinimumLevel));
        }
    }

    internal async ValueTask<IJSObjectReference> BridgeAsync() => await Bridge;

    /// <summary>The version of the Plainkit JavaScript the page loaded (<c>PK_VERSION</c> in <c>js/version.js</c>). It equals <see cref="PkAssets.Version"/> unless the app serves an older or newer copy of the assets.</summary>
    public async ValueTask<string> GetSdkVersionAsync() => await (await Bridge).InvokeAsync<string>("version");

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (_bridge is null) return;
        try
        {
            var bridge = await Bridge;
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
