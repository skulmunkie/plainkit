using System.Reflection;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #1368: the WebAssembly loader's contract with a fake assembly source (the real LazyAssemblyLoader runs only in the WASM sample, scripts/blazor-browser.mjs).
public sealed class PkLazyModuleLoaderTests : BunitContext, IAsyncLifetime
{
    private sealed class Lazy : IPkLazyModule
    {
        public PkModuleManifest Manifest => new() { Id = "lazy", Title = "Lazy" };
        public IReadOnlyList<string> Assemblies => ["Lazy.wasm"];
    }

    private sealed class Eager : IPkModule { public PkModuleManifest Manifest => new() { Id = "eager", Title = "Eager" }; }

    private static readonly Assembly Loaded = typeof(PkAssets).Assembly;
    private int _calls;
    private Func<Task<IEnumerable<Assembly>>> _source = () => Task.FromResult<IEnumerable<Assembly>>([Loaded]);

    public PkLazyModuleLoaderTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Module<Lazy>().Module<Eager>());
        Services.AddSingleton(Create);
        Services.AddSingleton<IPkModuleLoader>(sp => sp.GetRequiredService<PkLazyModuleLoader>());
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private PkLazyModuleLoader Loader => Services.GetRequiredService<PkLazyModuleLoader>();

    private PkLazyModuleLoader Create(IServiceProvider sp) => new(sp.GetRequiredService<PkModuleCatalog>(), names => { _calls++; Assert.Equal(["Lazy.wasm"], names); return _source(); });

    [Fact]
    public async Task Loads_the_assemblies_once_for_every_navigation()
    {
        var loader = Loader;
        await loader.LoadAsync(new Lazy(), default);
        await loader.LoadAsync(new Lazy(), default);
        Assert.Equal(1, _calls);
        Assert.Equal([Loaded], loader.Assemblies);
    }

    [Fact]
    public async Task Concurrent_navigations_share_one_load_and_a_leaving_caller_does_not_cancel_it()
    {
        var gate = new TaskCompletionSource<IEnumerable<Assembly>>();
        _source = () => gate.Task;
        var loader = Loader;
        using var leave = new CancellationTokenSource();
        var first = loader.LoadAsync(new Lazy(), leave.Token);
        var second = loader.LoadAsync(new Lazy(), default);
        leave.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        Assert.False(second.IsCompleted);
        gate.SetResult([Loaded]);
        await second;
        Assert.Equal(1, _calls);
        Assert.Equal([Loaded], loader.Assemblies);
    }

    [Fact]
    public async Task The_router_hook_loads_the_module_that_owns_the_path()
    {
        var loader = Loader;
        await loader.LoadForPathAsync("/eager/x", default);
        await loader.LoadForPathAsync("/nowhere", default);
        Assert.Equal(0, _calls);
        await loader.LoadForPathAsync("/lazy/records/8", default);
        await loader.LoadForPathAsync("/lazy", default);
        Assert.Equal(1, _calls);
    }

    [Fact]
    public async Task A_module_without_lazy_assemblies_loads_nothing()
    {
        var loader = Loader;
        await loader.LoadAsync(new Eager(), default);
        Assert.Equal(0, _calls);
        Assert.Empty(loader.Assemblies);
    }

    [Fact]
    public async Task A_failed_load_is_forgotten_so_the_next_navigation_retries()
    {
        _source = () => Task.FromException<IEnumerable<Assembly>>(new HttpRequestException("offline"));
        var loader = Loader;
        await Assert.ThrowsAsync<HttpRequestException>(() => loader.LoadAsync(new Lazy(), default));
        _source = () => Task.FromResult<IEnumerable<Assembly>>([Loaded]);
        await loader.LoadAsync(new Lazy(), default);
        Assert.Equal(2, _calls);
        Assert.Equal([Loaded], loader.Assemblies);
    }

    [Fact]
    public void A_failed_load_shows_the_boundary_and_Try_again_loads_again()
    {
        var fail = true;
        _source = () => fail ? Task.FromException<IEnumerable<Assembly>>(new HttpRequestException("offline")) : Task.FromResult<IEnumerable<Assembly>>([Loaded]);
        Services.GetRequiredService<NavigationManager>().NavigateTo("/lazy/x");
        var cut = Render<PkModuleBoundary>(p => p.AddChildContent<PkRouteGuard>(g => g.Add(x => x.ChildContent, "the page")));
        cut.WaitForAssertion(() => Assert.Contains("Something went wrong", cut.Markup));
        fail = false;
        cut.Find("pk-button").TriggerEvent("onpk-click", EventArgs.Empty);
        cut.WaitForAssertion(() => Assert.Contains("the page", cut.Markup));
        Assert.Equal(2, _calls);
    }
}
