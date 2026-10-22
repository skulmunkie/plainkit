using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1733: an unset PkLink string parameter leaves its attribute off the host; an empty `download` made every link download.
public sealed class PkLinkAttributeTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkLinkAttributeTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void A_link_with_only_Href_renders_no_download_to_target_or_rel_attribute()
    {
        var cut = Render<PkLink>(p => p.Add(x => x.Href, "/other-page"));
        var el = cut.Find("pk-link");

        Assert.Equal("/other-page", el.GetAttribute("href"));
        foreach (var name in new[] { "download", "to", "target", "rel" })
            Assert.False(el.HasAttribute(name), name);
    }

    [Fact]
    public void A_set_Download_still_renders_and_an_empty_one_keeps_the_file_name()
    {
        var cut = Render<PkLink>(p => p.Add(x => x.Href, "/f.pdf").Add(x => x.Download, ""));
        Assert.True(cut.Find("pk-link").HasAttribute("download"));
    }
}
