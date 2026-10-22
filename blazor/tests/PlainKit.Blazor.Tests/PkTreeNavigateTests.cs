using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor.Components;

namespace PlainKit.Blazor.Tests;

// Issue 1713: Navigate on PkTree and PkTreeItem is the element's navigate attribute, so an Href tree can leave navigation to the host (NavigationManager) like PkLink and PkTable.
public sealed class PkTreeNavigateTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkTreeNavigateTests() { JSInterop.Mode = JSRuntimeMode.Loose; Services.AddPlainKit(); }

    [Fact]
    public async Task Navigate_reaches_the_elements_and_OnNavigate_is_a_notification()
    {
        PkNavigateEventArgs? seen = null;
        var cut = Render<PkTree>(p => p.Add(x => x.Navigate, "host").AddChildContent<PkTreeItem>(i => i.Add(x => x.Href, "/a").Add(x => x.Navigate, "router").Add(x => x.OnNavigate, e => { seen = e; })));
        Assert.Equal("host", cut.Find("pk-tree").GetAttribute("navigate"));
        Assert.Equal("router", cut.Find("pk-tree-item").GetAttribute("navigate"));
        await cut.Find("pk-tree-item").TriggerEventAsync("onpk-navigate", new PkNavigateEventArgs { To = "/a", Href = "/a" });
        Assert.Equal("/a", seen!.To);
    }
}
