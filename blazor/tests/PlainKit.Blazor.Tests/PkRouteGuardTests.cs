using Bunit;
using Bunit.TestDoubles;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #364 step 4: the UX route guard, the loader seam and the error boundary.
public sealed class PkRouteGuardTests : BunitContext, IAsyncLifetime
{
    private sealed class Open : IPkModule { public PkModuleManifest Manifest => new() { Id = "open", Title = "Open" }; }

    private sealed class Closed : IPkModule, IPkModuleGuard
    {
        public PkModuleManifest Manifest => new() { Id = "closed", Title = "Closed" };
        public ValueTask<bool> CanAsync(PkModuleContext c) => ValueTask.FromResult(false);
    }

    private sealed class Loader : IPkModuleLoader
    {
        public List<string> Loaded { get; } = [];
        public Task LoadAsync(IPkModule m, CancellationToken ct) { Loaded.Add(m.Manifest.Id); return Task.CompletedTask; }
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkRouteGuardTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Module<Open>().Module<Closed>());
    }

    private IRenderedComponent<PkRouteGuard> Guard(string path)
    {
        Services.GetRequiredService<NavigationManager>().NavigateTo(path);
        return Render<PkRouteGuard>(p => p.Add(x => x.ChildContent, "the page"));
    }

    [Fact]
    public void Allows_a_module_without_a_guard() => Assert.Contains("the page", Guard("/open/x").Markup);

    [Fact]
    public void Allows_a_path_outside_every_module() => Assert.Contains("the page", Guard("/").Markup);

    [Fact]
    public void Denies_when_the_module_says_no()
    {
        var cut = Guard("/closed");
        Assert.DoesNotContain("the page", cut.Markup);
        Assert.Contains("Not allowed", cut.Markup);
    }

    [Fact]
    public void Checks_again_for_each_new_page()
    {
        var cut = Guard("/open");
        Services.GetRequiredService<NavigationManager>().NavigateTo("/closed");
        cut.Render(p => p.Add(x => x.ChildContent, b => b.AddContent(0, "next page")));
        cut.WaitForAssertion(() => Assert.Contains("Not allowed", cut.Markup));
        Services.GetRequiredService<NavigationManager>().NavigateTo("/open/y");
        cut.Render(p => p.Add(x => x.ChildContent, b => b.AddContent(0, "third page")));
        cut.WaitForAssertion(() => Assert.Contains("third page", cut.Markup));
    }

    [Fact]
    public void Loads_the_module_before_it_renders()
    {
        var loader = new Loader();
        Services.AddSingleton<IPkModuleLoader>(loader);
        Assert.Contains("the page", Guard("/open").Markup);
        Assert.Equal(["open"], loader.Loaded);
    }

    private sealed class Boom : ComponentBase
    {
        public static bool Fail = true;
        protected override void BuildRenderTree(Microsoft.AspNetCore.Components.Rendering.RenderTreeBuilder b) { if (Fail) throw new InvalidOperationException("boom"); b.AddContent(0, "recovered"); }
    }

    [Fact]
    public void Boundary_shows_an_error_and_retry_recovers()
    {
        Boom.Fail = true;
        var cut = Render<PkModuleBoundary>(p => p.AddChildContent<Boom>());
        Assert.Contains("Something went wrong", cut.Markup);
        Boom.Fail = false;
        cut.Find("pk-button").TriggerEvent("onpk-click", EventArgs.Empty);
        Assert.Contains("recovered", cut.Markup);
    }
}
