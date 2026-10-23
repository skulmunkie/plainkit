using Bunit;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1747: an Href link raises OnClick (a flyout listing links closes as one is followed); an unbound link attaches no click handler.
public sealed class PkLinkClickTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkLinkClickTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void An_Href_link_raises_OnClick_with_the_mouse_details()
    {
        MouseEventArgs? seen = null;
        var cut = Render<PkLink>(p => p
            .Add(x => x.Href, "/docs/x")
            .Add(x => x.OnClick, (MouseEventArgs e) => seen = e)
            .AddChildContent("Docs"));

        cut.Find("pk-link").Click(new MouseEventArgs { CtrlKey = true });

        Assert.NotNull(seen);
        Assert.True(seen!.CtrlKey);
        Assert.Equal("/docs/x", cut.Find("pk-link").GetAttribute("href"));
    }

    [Fact]
    public void A_link_without_OnClick_attaches_no_click_handler()
    {
        var cut = Render<PkLink>(p => p.Add(x => x.Href, "/docs/x"));
        Assert.Throws<MissingEventHandlerException>(() => cut.Find("pk-link").Click());
    }
}
