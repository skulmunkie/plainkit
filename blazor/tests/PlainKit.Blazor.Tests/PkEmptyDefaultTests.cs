using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Mapping audit after issue 1733: an unset string parameter must leave its attribute off the host. An empty `href` on a pk-nav-item
// matches the CSS `:host(:not([href]))` (branch chevron) and the shell's `pk-nav-item[href]` selector, so a branch row lost its chevron.
public sealed class PkEmptyDefaultTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkEmptyDefaultTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void A_nav_item_without_Href_renders_no_href_attribute()
    {
        var cut = Render<PkNavItem>(p => p.Add(x => x.Expanded, true));
        Assert.False(cut.Find("pk-nav-item").HasAttribute("href"));
    }

    [Fact]
    public void A_set_Href_still_renders()
    {
        var cut = Render<PkNavItem>(p => p.Add(x => x.Href, "/reports"));
        Assert.Equal("/reports", cut.Find("pk-nav-item").GetAttribute("href"));
    }
}
