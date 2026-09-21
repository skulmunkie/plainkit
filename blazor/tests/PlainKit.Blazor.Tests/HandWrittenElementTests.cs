using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkCard, PkEmptyState, PkFieldList and PkStat: hand-written over their elements (blazor/mappings marks them "existing").
public sealed class HandWrittenElementTests : TestContext
{
    public HandWrittenElementTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Card_sends_its_parameters_as_attributes_and_leaves_unset_ones_off()
    {
        var cut = RenderComponent<PkCard>(p => p
            .Add(x => x.Heading, "Plan")
            .Add(x => x.Level, 3)
            .Add(x => x.Flush, true)
            .Add(x => x.Href, "/plan")
            .Add(x => x.ChildContent, "Body"));
        var el = cut.Find("pk-card");

        Assert.Equal("Plan", el.GetAttribute("heading"));
        Assert.Equal("3", el.GetAttribute("level"));
        Assert.NotNull(el.GetAttribute("flush"));
        Assert.Equal("/plan", el.GetAttribute("href"));
        Assert.Null(el.GetAttribute("tone"));
        Assert.Null(el.GetAttribute("fill"));
        Assert.Contains("Body", el.TextContent);
    }

    [Fact]
    public void Card_renders_named_fragments_in_their_slots_only_when_set()
    {
        var cut = RenderComponent<PkCard>(p => p
            .Add(x => x.ActionsContent, "Edit")
            .Add(x => x.FooterContent, "Foot")
            .Add(x => x.MediaContent, "Pic"));

        Assert.Equal("Edit", cut.Find("[slot=actions]").TextContent);
        Assert.Equal("Foot", cut.Find("[slot=footer]").TextContent);
        Assert.Equal("Pic", cut.Find("[slot=media]").TextContent);
        Assert.Empty(RenderComponent<PkCard>().FindAll("[slot]"));
    }

    [Fact]
    public void Card_takes_id_data_aria_and_class_from_the_caller()
    {
        var cut = RenderComponent<PkCard>(p => p.AddUnmatched("id", "c").AddUnmatched("data-test", "d").AddUnmatched("aria-label", "a").AddUnmatched("class", "wide"));
        var el = cut.Find("pk-card");

        Assert.Equal("c", el.Id);
        Assert.Equal("d", el.GetAttribute("data-test"));
        Assert.Equal("a", el.GetAttribute("aria-label"));
        Assert.Equal("wide", el.GetAttribute("class"));
    }

    [Fact]
    public void EmptyState_maps_Title_to_heading_and_fills_its_slots()
    {
        var cut = RenderComponent<PkEmptyState>(p => p
            .Add(x => x.Title, "No rows")
            .Add(x => x.Description, "Add one")
            .Add(x => x.Tone, "compact")
            .Add(x => x.IconContent, "i")
            .Add(x => x.TitleContent, "Rich title")
            .Add(x => x.ActionContent, "Add")
            .Add(x => x.DescriptionContent, "Body"));
        var el = cut.Find("pk-empty-state");

        Assert.Equal("No rows", el.GetAttribute("heading"));
        Assert.Equal("Add one", el.GetAttribute("description"));
        Assert.Equal("compact", el.GetAttribute("tone"));
        Assert.Equal("i", cut.Find("[slot=icon]").TextContent);
        Assert.Equal("Rich title", cut.Find("[slot=heading]").TextContent);
        Assert.Equal("Add", cut.Find("[slot=actions]").TextContent);
        Assert.Contains("Body", el.TextContent);
    }

    [Fact]
    public void FieldList_sends_heading_layout_and_flags()
    {
        var cut = RenderComponent<PkFieldList>(p => p
            .Add(x => x.Title, "Details")
            .Add(x => x.Layout, "stacked")
            .Add(x => x.Dividers, true)
            .Add(x => x.ChildContent, builder =>
            {
                builder.OpenElement(0, "dt"); builder.AddContent(1, "Name"); builder.CloseElement();
                builder.OpenElement(2, "dd"); builder.AddContent(3, "Ada"); builder.CloseElement();
            }));
        var el = cut.Find("pk-field-list");

        Assert.Equal("Details", el.GetAttribute("heading"));
        Assert.Equal("stacked", el.GetAttribute("layout"));
        Assert.NotNull(el.GetAttribute("dividers"));
        Assert.Null(el.GetAttribute("dense"));
        Assert.Equal("Ada", cut.Find("dd").TextContent);
    }

    [Fact]
    public void Stat_sends_the_headline_the_tone_and_the_sparkline()
    {
        var cut = RenderComponent<PkStat>(p => p
            .Add(x => x.Label, "Revenue")
            .Add(x => x.Value, "$1.2k")
            .Add(x => x.Subtext, "this week")
            .Add(x => x.Tone, PkStatTone.Positive)
            .Add(x => x.Delta, "4.5")
            .Add(x => x.Invert, true)
            .Add(x => x.Series, new List<double> { 1, 2.5, 3 })
            .Add(x => x.Tile, true));
        var el = cut.Find("pk-stat");

        Assert.Equal("Revenue", el.GetAttribute("label"));
        Assert.Equal("$1.2k", el.GetAttribute("value"));
        Assert.Equal("this week", el.GetAttribute("subtext"));
        Assert.Equal("positive", el.GetAttribute("tone"));
        Assert.Equal("4.5", el.GetAttribute("delta"));
        Assert.NotNull(el.GetAttribute("invert"));
        Assert.Equal("[1,2.5,3]", el.GetAttribute("values"));
        Assert.NotNull(el.GetAttribute("tile"));
        Assert.Null(el.GetAttribute("href"));
    }

    [Fact]
    public void Stat_leaves_the_neutral_tone_and_an_empty_series_off()
    {
        var el = RenderComponent<PkStat>(p => p.Add(x => x.Label, "Users")).Find("pk-stat");

        Assert.Null(el.GetAttribute("tone"));
        Assert.Null(el.GetAttribute("values"));
    }

    [Fact]
    public async Task Stat_raises_OnClick_on_pk_activate()
    {
        var clicks = 0;
        var cut = RenderComponent<PkStat>(p => p
            .Add(x => x.Interactive, true)
            .Add(x => x.OnClick, EventCallback.Factory.Create(this, () => clicks++))
            .AddUnmatched("data-test", "s"));

        await cut.Find("pk-stat").TriggerEventAsync("onpk-activate", new PkActivateEventArgs { Href = null });

        Assert.Equal(1, clicks);
        Assert.Equal("s", cut.Find("pk-stat").GetAttribute("data-test"));
    }
}
