using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 728: a card header's own menu of secondary actions: a PkDropdown opened by an icon-only button, hand-assembled by every consumer until now.
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
    public void It_is_a_dropdown_at_the_end_opened_by_a_named_icon_only_button()
    {
        var cut = Render<PkCardMenu>(p => p.Add(x => x.ChildContent, Items));

        var dropdown = cut.Find("pk-dropdown");
        Assert.Equal("bottom-end", dropdown.GetAttribute("placement"));
        var trigger = dropdown.QuerySelector("[slot=trigger] pk-button")!;
        Assert.True(trigger.HasAttribute("icon"));
        Assert.Equal("more", trigger.GetAttribute("icon-name"));
        Assert.Equal("Card actions", trigger.GetAttribute("label"));
        Assert.Equal("Rename", dropdown.QuerySelector("pk-menu-item")!.TextContent);
    }

    [Fact]
    public void The_label_and_the_icon_can_be_set_and_attributes_reach_the_dropdown()
    {
        var cut = Render<PkCardMenu>(p => p.Add(x => x.Label, "Panel settings").Add(x => x.IconName, "settings").AddUnmatched("data-test", "m").Add(x => x.ChildContent, Items));

        var trigger = cut.Find("pk-dropdown [slot=trigger] pk-button");
        Assert.Equal("Panel settings", trigger.GetAttribute("label"));
        Assert.Equal("settings", trigger.GetAttribute("icon-name"));
        Assert.Equal("m", cut.Find("pk-dropdown").GetAttribute("data-test"));
    }

    [Fact]
    public async Task A_chosen_item_reaches_OnSelect()
    {
        string? value = null;
        var cut = Render<PkCardMenu>(p => p.Add(x => x.ChildContent, Items).Add(x => x.OnSelect, EventCallback.Factory.Create<PkSelectEventArgs>(this, e => value = e.Value)));

        await cut.Find("pk-dropdown").TriggerEventAsync("onpk-select", new PkSelectEventArgs { Value = "rename" });

        Assert.Equal("rename", value);
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

        Assert.NotNull(cut.Find("pk-card [slot=actions] pk-dropdown"));
    }
}
