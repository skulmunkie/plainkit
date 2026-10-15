using System.Reflection;

namespace PlainKit.Blazor;

/// <summary>An <see cref="IPkModule"/> whose pages live in assemblies the host loads on the first navigation into the module (#1368). The names are the host's <c>BlazorWebAssemblyLazyLoad</c> items (<c>Foo.wasm</c>).</summary>
public interface IPkLazyModule : IPkModule
{
    /// <summary>The assembly file names to load before the module's page renders.</summary>
    IReadOnlyList<string> Assemblies { get; }
}

/// <summary>
/// The <see cref="IPkModuleLoader"/> for WebAssembly (#1368): loads a lazy module's assemblies once, on the first navigation into it. The load itself is the host's delegate, so this package takes no WebAssembly dependency:
/// <c>AddSingleton(sp =&gt; new PkLazyModuleLoader(sp.GetRequiredService&lt;PkModuleCatalog&gt;(), names =&gt; sp.GetRequiredService&lt;LazyAssemblyLoader&gt;().LoadAssembliesAsync(names)))</c>.
/// Wire it to the router as <c>&lt;Router AdditionalAssemblies="Loader.Assemblies" OnNavigateAsync="c =&gt; Loader.LoadForPathAsync(c.Path, c.CancellationToken)"&gt;</c>: an in-app navigation reaches the router before the guard, and a router that cannot match a route reloads the page.
/// A module that is not an <see cref="IPkLazyModule"/> (and every module on Server, where nothing registers this loader) is a no-op. A failed load is forgotten, so the next navigation tries again.
/// </summary>
public sealed class PkLazyModuleLoader(PkModuleCatalog catalog, Func<IReadOnlyList<string>, Task<IEnumerable<Assembly>>> load) : IPkModuleLoader
{
    private readonly Dictionary<string, Task> _loads = [];
    private readonly List<Assembly> _assemblies = [];

    /// <summary>Every assembly loaded so far: the router's <c>AdditionalAssemblies</c>. The same list for ever, so the router sees what loads after it was given it.</summary>
    public IReadOnlyList<Assembly> Assemblies => _assemblies;

    /// <summary>Loads the module that owns this app path (its first segment), if it is a lazy one. The router's <c>OnNavigateAsync</c>, which runs before routes are matched.</summary>
    public Task LoadForPathAsync(string path, CancellationToken cancellationToken) =>
        path.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() is { } id && catalog.Get(id) is { } module ? LoadAsync(module, cancellationToken) : Task.CompletedTask;

    /// <inheritdoc />
    public async Task LoadAsync(IPkModule module, CancellationToken cancellationToken)
    {
        if (module is not IPkLazyModule { Assemblies.Count: > 0 } lazy) return;
        var id = lazy.Manifest.Id;
        Task task;
        lock (_loads) task = _loads.TryGetValue(id, out var t) ? t : _loads[id] = Run(lazy);
        try { await task.WaitAsync(cancellationToken); }
        catch when (task.IsFaulted) { lock (_loads) if (_loads.TryGetValue(id, out var t) && t == task) _loads.Remove(id); throw; }
    }

    // One load per module, shared by every navigation that arrives meanwhile; a caller that leaves (its token) does not cancel it for the others.
    private async Task Run(IPkLazyModule module)
    {
        var loaded = await load(module.Assemblies);
        lock (_loads) _assemblies.AddRange(loaded);
    }
}
