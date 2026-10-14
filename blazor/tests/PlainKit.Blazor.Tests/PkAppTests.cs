using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #364 step 3: the PkApp frame over the module catalog. Where the reader is comes from PkNavModel (fixture-tested separately); here the frame draws it.
public sealed class PkAppTests : BunitContext, IAsyncLifetime
{
    private sealed class Overview : IPkModule { public PkModuleManifest Manifest => new() { Id = "overview", Title = "Overview" }; }

    private sealed class Orders : IPkModule
    {
        public PkModuleManifest Manifest => new()
        {
            Id = "orders", Title = "Orders",
            Nav = [new() { Id = "all", Title = "All orders", Route = "/" }, new() { Id = "open", Title = "Open", Route = "/open", Icon = "list" }],
            Routes = [new() { Path = "/", Page = "list", Label = "All orders", Children = [new() { Path = "/:id", Page = "record", Label = "Order" }] }, new() { Path = "/open", Page = "list", Label = "Open" }],
        };
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkAppTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Brand("Demo app").Module<Overview>().Module<Orders>().Home("overview").Footer("Run by Finance"));
    }

    private static string[] Labels(IRenderedComponent<PkApp> cut, string attr, string key) =>
        JsonDocument.Parse(cut.Find("pk-app-frame").GetAttribute(attr)!).RootElement.EnumerateArray().Select(e => e.GetProperty(key).GetString()!).ToArray();

    [Fact]
    public void Hands_the_brand_modules_footer_and_page_to_the_frame()
    {
        var cut = Render<PkApp>(p => p.Add(x => x.ChildContent, "page body"));
        var frame = cut.Find("pk-app-frame");
        Assert.Equal("Demo app", frame.GetAttribute("brand"));
        Assert.Equal(new[] { "Overview", "Orders" }, Labels(cut, "modules", "title"));
        Assert.Contains("Run by Finance", frame.QuerySelector("[slot=footer]")!.TextContent);
        Assert.Contains("page body", cut.Find("main#pk-main").TextContent);
        Assert.NotNull(cut.Find("pk-skip-link"));
    }

    [Fact]
    public void Sends_the_current_row_and_the_trail_for_the_address()
    {
        Services.GetRequiredService<NavigationManager>().NavigateTo("/orders/open");
        var cut = Render<PkApp>();
        Assert.Equal("open", cut.Find("pk-app-frame").GetAttribute("current-id"));
        Assert.Equal("Orders", cut.Find("pk-app-frame").GetAttribute("module-title"));
        Assert.Equal(new[] { "All orders", "Open" }, Labels(cut, "nav", "title"));
        Assert.Equal(new[] { "Demo app", "Orders", "Open" }, Labels(cut, "crumbs", "label"));
        Assert.EndsWith("/orders/open", JsonDocument.Parse(cut.Find("pk-app-frame").GetAttribute("nav")!).RootElement[1].GetProperty("href").GetString());
    }

    [Fact]
    public void Follows_a_navigation()
    {
        var cut = Render<PkApp>();
        Assert.Equal("[]", cut.Find("pk-app-frame").GetAttribute("nav"));
        Services.GetRequiredService<NavigationManager>().NavigateTo("/orders/42");
        cut.WaitForAssertion(() => Assert.Equal(new[] { "Demo app", "Orders", "Order" }, Labels(cut, "crumbs", "label")));
        Assert.Equal("all", cut.Find("pk-app-frame").GetAttribute("current-id"));
    }

    [Fact]
    public async Task Search_filters_the_nav_and_a_chosen_result_navigates()
    {
        var nav = Services.GetRequiredService<NavigationManager>();
        nav.NavigateTo("/orders");
        var cut = Render<PkApp>();
        await cut.InvokeAsync(() => cut.FindComponent<Shells.PkAppFrame>().Instance.OnQuery.InvokeAsync(new PkQueryEventArgs { Query = "OPEN" }));
        Assert.Equal(new[] { "Open" }, Labels(cut, "search-items", "label"));
        var item = JsonDocument.Parse("{\"id\":\"/orders/open\",\"label\":\"Open\"}").RootElement;
        await cut.InvokeAsync(() => cut.FindComponent<Shells.PkAppFrame>().Instance.OnSelect.InvokeAsync(new PkSelectEventArgs { Item = item }));
        Assert.EndsWith("/orders/open", nav.Uri);
    }

    [Fact]
    public void A_route_change_calls_the_bridge_once_with_the_page_label_and_the_site_not_on_first_render()
    {
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        var nav = Services.GetRequiredService<NavigationManager>();
        nav.NavigateTo("/orders");
        var cut = Render<PkApp>();
        Assert.Empty(bridge.Invocations["routeChanged"]);
        cut.InvokeAsync(() => nav.NavigateTo("/orders/open"));
        var call = Assert.Single(bridge.Invocations["routeChanged"]);
        Assert.Equal(new object?[] { "Open", "Demo app" }, call.Arguments);
        cut.InvokeAsync(() => nav.NavigateTo("/orders"));
        Assert.Equal(2, bridge.Invocations["routeChanged"].Count);
    }

    [Fact]
    public async Task Mounting_and_disposing_leaves_no_location_handler()
    {
        var nav = Services.GetRequiredService<NavigationManager>();
        var before = Handlers(nav);
        for (var i = 0; i < 100; i++) { Render<PkApp>(); await DisposeComponentsAsync(); }
        Assert.Equal(before, Handlers(nav));
    }

    private static int Handlers(NavigationManager nav)
    {
        var f = typeof(NavigationManager).GetField("_locationChanged", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        return (f?.GetValue(nav) as Delegate)?.GetInvocationList().Length ?? 0;
    }
}
