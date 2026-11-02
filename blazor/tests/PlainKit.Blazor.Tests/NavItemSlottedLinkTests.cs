using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #1841: a Razor host puts its own <a href> in PkNavItem's ChildContent; the wrapper renders it unchanged into the element's default slot
// (a light-DOM child of pk-nav-item), sets no href attribute of its own, and does not touch the anchor's attributes.
public sealed class NavItemSlottedLinkTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public NavItemSlottedLinkTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void A_slotted_anchor_in_ChildContent_is_a_direct_unchanged_child_of_the_element()
    {
        var cut = Render<PkNavItem>(p => p
            .Add(x => x.Current, true)
            .AddChildContent("<a href=\"/reports\" aria-current=\"page\">Reports</a>"));
        var item = cut.Find("pk-nav-item");
        var a = item.QuerySelector(":scope > a[href]");
        Assert.NotNull(a);
        Assert.Equal("/reports", a!.GetAttribute("href"));
        Assert.Equal("page", a.GetAttribute("aria-current"));
        Assert.Equal("Reports", a.TextContent);
        Assert.False(a.HasAttribute("slot"));
        Assert.False(item.HasAttribute("href"));
        Assert.True(item.HasAttribute("current"));
    }
}
