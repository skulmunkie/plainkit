using Microsoft.AspNetCore.Components;
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
    private ResourceAssetCollection? _bridgeAssets;

    // The bridge is wrapped so the calls PlainKit.Blazor makes into it are counted and timed (PkInteropLog); the import itself is not a bridge call.
    private Task<IJSObjectReference> Bridge => _bridge ??= ImportAsync();

    private async Task<IJSObjectReference> ImportAsync() => new PkTrackedBridge(await js.InvokeAsync<IJSObjectReference>("import", PkAssets.BridgeUrl(_bridgeAssets)), _interop);

    /// <summary>The calls made through the bridge so far: count, duration and errors per function.</summary>
    public PkInteropLog Interop => _interop;

    /// <summary>True once <see cref="EnsureInitializedAsync"/> has finished.</summary>
    public bool IsInitialized => _init is { IsCompletedSuccessfully: true };

    /// <summary>
    /// Wires the <c>pk-*</c> elements and behaviours for the page once, however many components ask. Pass a component's own <c>Assets</c> (from
    /// <c>Microsoft.AspNetCore.Components.Web</c>, a <see cref="ComponentBase"/> member) when you have one: the bridge is then imported from its
    /// fingerprinted URL, which the host serves with a year-long, immutable <c>Cache-Control</c> once it calls <c>app.MapStaticAssets()</c>. The
    /// first caller's value wins (later, differing calls do not re-import). Omitted, the bridge loads from its plain path (still correct, just
    /// revalidated on every warm visit).
    /// </summary>
    public Task EnsureInitializedAsync(ResourceAssetCollection? assets = null)
    {
        _bridgeAssets ??= assets;
        return _init ??= InitAsync();
    }

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
            await bridge.InvokeVoidAsync("writeLog", "warn", "blazor", message, System.Text.Json.JsonSerializer.Serialize(new { package = PkAssets.Version, javascript = sdk }));
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

    /// <summary>The bridge, importing it first if needed. Pass <paramref name="assets"/> as in <see cref="EnsureInitializedAsync"/> when you have a component's own <c>Assets</c> and no other call has set it yet.</summary>
    internal async ValueTask<IJSObjectReference> BridgeAsync(ResourceAssetCollection? assets = null)
    {
        _bridgeAssets ??= assets;
        return await Bridge;
    }

    /// <summary>The version of the Plainkit JavaScript the page loaded (<c>PK_VERSION</c> in <c>js/version.js</c>). It equals <see cref="PkAssets.Version"/> unless the app serves an older or newer copy of the assets.</summary>
    public async ValueTask<string> GetSdkVersionAsync() => await (await Bridge).InvokeAsync<string>("version");

    /// <summary>
    /// The values the controls of a form hold right now, by control name (what the browser would submit; a name used twice keeps its last value).
    /// A form reset gives the controls their initial values again without raising a change event, so a value your component mirrors is stale
    /// afterwards: call this from <c>PkForm.OnReset</c> (raised after the controls have their initial values) and copy the values back.
    /// </summary>
    /// <param name="form">The <see cref="PkForm"/>'s <see cref="PkElementBase.Element"/> (it wraps a native <c>&lt;form&gt;</c>, which is the one read), or a native form's reference.</param>
    public async ValueTask<IReadOnlyDictionary<string, string>> ReadFormValuesAsync(ElementReference form) =>
        await (await Bridge).InvokeAsync<Dictionary<string, string>>("formValues", form);

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
