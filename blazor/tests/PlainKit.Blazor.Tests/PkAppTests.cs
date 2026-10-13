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

    [Fact]
    public void Draws_the_brand_picker_footer_and_the_page()
    {
        var cut = Render<PkApp>(p => p.Add(x => x.ChildContent, "page body"));
        Assert.Contains("Demo app", cut.Find("pk-navbar a[slot=brand], pk-navbar [slot=brand] a").TextContent);
        Assert.Equal(new[] { "Overview", "Orders" }, cut.FindAll("pk-dropdown pk-menu-item[href*=\"/\"]").Select(m => m.TextContent.Trim()));
        Assert.Contains("Run by Finance", cut.Find("pk-app-shell [slot=footer]").TextContent);
        Assert.Contains("page body", cut.Find("main#pk-main").TextContent);
    }

    [Fact]
    public void Marks_the_current_nav_row_and_the_trail_for_the_address()
    {
        Services.GetRequiredService<NavigationManager>().NavigateTo("/orders/open");
        var cut = Render<PkApp>();
        var current = cut.FindAll("pk-nav-item[current]");
        Assert.Single(current);
        Assert.Contains("Open", current[0].TextContent);
        Assert.Equal(new[] { "Demo app", "Orders", "Open" }, cut.FindAll("pk-breadcrumb a").Select(a => a.TextContent.Trim()));
        Assert.Equal("page", cut.FindAll("pk-breadcrumb a")[^1].GetAttribute("aria-current"));
    }

    [Fact]
    public void Follows_a_navigation_and_lists_only_the_active_modules_nav()
    {
        var cut = Render<PkApp>();
        Assert.Empty(cut.FindAll("pk-side-nav"));
        Services.GetRequiredService<NavigationManager>().NavigateTo("/orders/42");
        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll("pk-side-nav pk-nav-item").Count));
        Assert.Equal(new[] { "Demo app", "Orders", "Order" }, cut.FindAll("pk-breadcrumb a").Select(a => a.TextContent.Trim()));
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
