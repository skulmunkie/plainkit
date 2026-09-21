using Microsoft.AspNetCore.Components.Server.Circuits;

namespace PlainKit.Blazor;

/// <summary>
/// Feeds <see cref="PkCircuitState"/> from the framework's circuit events. Server only, and internal: the type derives from a class in the ASP.NET Core server
/// assembly, which a browser (WebAssembly) app does not have, so it must never be reachable from a public type or the router's assembly scan fails there.
/// </summary>
internal sealed class PkCircuitHandler(PkCircuitState state) : CircuitHandler
{
    public override Task OnCircuitOpenedAsync(Circuit circuit, CancellationToken cancellationToken)
    {
        state.Opened(circuit.Id);
        return Task.CompletedTask;
    }

    public override Task OnConnectionUpAsync(Circuit circuit, CancellationToken cancellationToken)
    {
        state.ConnectionUp();
        return Task.CompletedTask;
    }

    public override Task OnConnectionDownAsync(Circuit circuit, CancellationToken cancellationToken)
    {
        state.ConnectionDown();
        return Task.CompletedTask;
    }

    public override Task OnCircuitClosedAsync(Circuit circuit, CancellationToken cancellationToken)
    {
        state.Closed();
        return Task.CompletedTask;
    }
}
