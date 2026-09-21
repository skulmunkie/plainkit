using System.Runtime.InteropServices;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>The circuit, as far as the framework's own events tell it. Null on WebAssembly, where there is no circuit.</summary>
internal sealed record PkCircuitFacts(string Phase, string? Id, DateTimeOffset? OpenedAt, DateTimeOffset? ConnectedAt, DateTimeOffset? DisconnectedAt, int Disconnects, int Reconnects);

/// <summary>Everything the dev tools' Blazor panel shows: only values read from the runtime, the circuit handler and the bridge's call log.</summary>
internal sealed record PkBlazorSnapshot(
    string Host,
    string Framework,
    string PackageVersion,
    string? SdkVersion,
    bool RuntimeInitialized,
    bool ForwardingToILogger,
    PkCircuitFacts? Circuit,
    PkInteropSnapshot Interop);

/// <summary>
/// What the dev tools' Blazor panel (<c>blazor-devtools.js</c>) calls back into. One per dev tools component. The panel reads a snapshot on a timer while
/// its tab is open; those reads go through the .NET-to-JS callback path and are not bridge calls, so they do not appear in the interop counts.
/// </summary>
internal sealed class PkDevToolsHost(PkRuntime runtime, PkOptions options, PkCircuitState? circuit = null)
{
    private string? _sdkVersion;

    /// <summary>The current facts.</summary>
    [JSInvokable]
    public async Task<PkBlazorSnapshot> Snapshot()
    {
        try { _sdkVersion ??= await runtime.GetSdkVersionAsync(); }
        catch (Exception e) when (e is JSException or JSDisconnectedException or InvalidOperationException) { /* the count records it; the panel shows the version as unknown */ }
        return new PkBlazorSnapshot(
            OperatingSystem.IsBrowser() ? "Blazor WebAssembly" : "Blazor Server",
            RuntimeInformation.FrameworkDescription,
            PkAssets.Version,
            _sdkVersion,
            runtime.IsInitialized,
            options.Logging.ForwardToILogger,
            circuit is null ? null : new PkCircuitFacts(circuit.Phase.ToString(), circuit.CircuitId, circuit.OpenedAt, circuit.ConnectedAt, circuit.DisconnectedAt, circuit.Disconnects, circuit.Reconnects),
            runtime.Interop.Snapshot());
    }

    /// <summary>The component for an element, its parameters and the Razor for the given markup (see <see cref="PkMappingInfo.Describe"/>).</summary>
    [JSInvokable]
    public PkComponentInfo? Describe(string tag, Dictionary<string, string?>? defaults, Dictionary<string, string>? attributes, string? text) =>
        PkMappingInfo.Describe(tag, defaults, attributes, text);
}
