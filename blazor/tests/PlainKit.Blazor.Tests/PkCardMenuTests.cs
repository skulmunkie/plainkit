using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 728: the card header menu is generated from the pk-card-menu element (it was hand-written until then).
public sealed class PkCardMenuTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkCardMenuTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static RenderFragment Items => b =>
    {
        b.OpenComponent<PkMenuItem>(0);
        b.AddAttribute(1, nameof(PkMenuItem.Value), "rename");
        b.AddAttribute(2, nameof(PkMenuItem.ChildContent), (RenderFragment)(c => c.AddContent(0, "Rename")));
        b.CloseComponent();
    };

    [Fact]
    public void It_is_the_pk_card_menu_element_with_the_old_parameter_names()
    {
        var cut = Render<PkCardMenu>(p => p.Add(x => x.Label, "Panel settings").Add(x => x.IconName, "settings").Add(x => x.Placement, "bottom-start").AddUnmatched("data-test", "m").Add(x => x.ChildContent, Items));

        var el = cut.Find("pk-card-menu");
        Assert.Equal("Panel settings", el.GetAttribute("label"));
        Assert.Equal("settings", el.GetAttribute("icon-name"));
        Assert.Equal("bottom-start", el.GetAttribute("placement"));
        Assert.Equal("m", el.GetAttribute("data-test"));
        Assert.Equal("Rename", el.QuerySelector("pk-menu-item")!.TextContent);
    }

    [Fact]
    public async Task A_chosen_item_reaches_OnSelect()
    {
        string? value = null;
        var cut = Render<PkCardMenu>(p => p.Add(x => x.ChildContent, Items).Add(x => x.OnSelect, EventCallback.Factory.Create<PkSelectEventArgs>(this, e => value = e.Value)));

        await cut.Find("pk-card-menu").TriggerEventAsync("onpk-select", new PkSelectEventArgs { Value = "rename" });

        Assert.Equal("rename", value);
    }

    [Fact]
    public async Task Open_follows_the_menu_both_ways()
    {
        var open = false;
        var cut = Render<PkCardMenu>(p => p.Add(x => x.Open, true).Add(x => x.OpenChanged, EventCallback.Factory.Create<bool>(this, v => open = v)).Add(x => x.ChildContent, Items));
        Assert.True(cut.Find("pk-card-menu").HasAttribute("open"));

        await cut.Find("pk-card-menu").TriggerEventAsync("onpk-close", new PkCloseEventArgs { Reason = "escape" });

        Assert.False(open);
    }

    [Fact]
    public void It_sits_in_the_actions_slot_of_a_card()
    {
        var cut = Render<PkCard>(p => p.Add(x => x.Heading, "Orders").Add(x => x.ActionsContent, b =>
        {
            b.OpenComponent<PkCardMenu>(0);
            b.AddAttribute(1, nameof(PkCardMenu.ChildContent), Items);
            b.CloseComponent();
        }));

        Assert.NotNull(cut.Find("pk-card [slot=actions] pk-card-menu"));
    }
}
