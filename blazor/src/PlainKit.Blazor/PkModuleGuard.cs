namespace PlainKit.Blazor;

/// <summary>What a guard may look at: the app-wide path and the services.</summary>
public sealed record PkModuleContext(string Path, IServiceProvider Services);

/// <summary>Implemented by an <see cref="IPkModule"/> that limits who sees it (#364). False shows the not-allowed state instead of the page. It hides, it does not protect: authorization stays on the server (<c>[Authorize]</c>).</summary>
public interface IPkModuleGuard
{
    ValueTask<bool> CanAsync(PkModuleContext context);
}

/// <summary>Makes a module's code available before its page renders (WebAssembly lazy assemblies). Register one to enable it; without one modules are already loaded.</summary>
public interface IPkModuleLoader
{
    Task LoadAsync(IPkModule module, CancellationToken cancellationToken);
}
