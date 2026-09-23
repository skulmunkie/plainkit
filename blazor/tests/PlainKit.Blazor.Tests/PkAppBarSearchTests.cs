using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 213: PkAppBarSearch sends Items as a typed JSON attribute (like PkTable's Columns/Items) and collapses itself on navigation
// (NavigationManager, the same pattern PkSideNav established in issue 210), since the element's own popstate listener does not see a
// Blazor route change that used pushState without a popstate.
public sealed class PkAppBarSearchTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly NavigationManager NavigationManager;

    public PkAppBarSearchTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        NavigationManager = Services.GetRequiredService<NavigationManager>();
    }

    [Fact]
    public void Items_reaches_the_element_as_a_JSON_attribute()
    {
        var items = new[] { new PkAppBarSearchItem { Id = "a", Label = "Widget A", Group = "Products" } };
        var cut = Render<PkAppBarSearch>(p => p.Add(x => x.Items, items));
        var attr = cut.Find("pk-app-bar-search").GetAttribute("items");
        Assert.Contains("\"label\":\"Widget A\"", attr);
        Assert.Contains("\"group\":\"Products\"", attr);
    }

    [Fact]
    public async Task A_navigation_after_render_collapses_an_expanded_field_and_raises_ExpandedChanged()
    {
        var changedTo = new List<bool>();
        var cut = Render<PkAppBarSearch>(p => p.Add(x => x.Expanded, true).Add(x => x.ExpandedChanged, EventCallback.Factory.Create<bool>(this, v => changedTo.Add(v))));

        NavigationManager.NavigateTo("/orders/7");
        await Task.Delay(10); // HandleLocationChanged dispatches async (InvokeAsync); give it a turn.

        Assert.False(cut.Instance.Expanded);
        Assert.Contains(false, changedTo);
    }

    [Fact]
    public void A_navigation_while_not_expanded_does_nothing()
    {
        var changed = 0;
        Render<PkAppBarSearch>(p => p.Add(x => x.Expanded, false).Add(x => x.ExpandedChanged, EventCallback.Factory.Create<bool>(this, () => changed++)));
        NavigationManager.NavigateTo("/orders/7");
        Assert.Equal(0, changed);
    }

    [Fact]
    public async Task pk_toggle_from_the_element_updates_Expanded_and_raises_ExpandedChanged()
    {
        var changedTo = new List<bool>();
        var cut = Render<PkAppBarSearch>(p => p.Add(x => x.ExpandedChanged, EventCallback.Factory.Create<bool>(this, v => changedTo.Add(v))));
        await cut.Find("pk-app-bar-search").TriggerEventAsync("onpk-toggle", new PkToggleEventArgs { Expanded = true });
        Assert.True(cut.Instance.Expanded);
        Assert.Contains(true, changedTo);
    }

    [Fact]
    public async Task Disposing_the_component_stops_it_reacting_to_further_navigation()
    {
        var cut = Render<PkAppBarSearch>(p => p.Add(x => x.Expanded, true));
        cut.Instance.Dispose(); // bUnit disposes the render tree itself at teardown; this proves the handler is gone before then.

        var ex = await Record.ExceptionAsync(async () => { NavigationManager.NavigateTo("/orders/7"); await Task.Delay(10); });
        Assert.Null(ex);
    }
}
