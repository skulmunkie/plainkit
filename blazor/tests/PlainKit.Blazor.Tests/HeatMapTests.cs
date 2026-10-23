using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1721 (phase 4): the generated PkHeatMap sends its parameters as attributes and hands the two events to their callbacks.
public sealed class HeatMapTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public HeatMapTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Items_are_sent_as_camel_case_json_with_children_and_intensity()
    {
        var items = new[]
        {
            new PkHeatItem { Id = "pay", Label = "Payments", Children = [new PkHeatItem { Id = "p1", Label = "Invoices", Value = 30, Severity = "warning", Href = "/i" }] },
            new PkHeatItem { Id = "web", Label = "Web", Value = 5.5, Intensity = 0.4 },
        };
        var cut = Render<PkHeatMap>(p => p.Add(x => x.Items, items));

        using var doc = JsonDocument.Parse(cut.Find("pk-heat-map").GetAttribute("items")!);
        var first = doc.RootElement[0].GetProperty("children")[0];
        Assert.Equal("Invoices", first.GetProperty("label").GetString());
        Assert.Equal("warning", first.GetProperty("severity").GetString());
        Assert.Equal("/i", first.GetProperty("href").GetString());
        Assert.Equal(0.4, doc.RootElement[1].GetProperty("intensity").GetDouble());
    }

    [Fact]
    public void Items_left_unset_leave_the_attribute_off()
        => Assert.Null(Render<PkHeatMap>().Find("pk-heat-map").GetAttribute("items"));

    [Fact]
    public void Parameters_become_their_attributes()
    {
        var cut = Render<PkHeatMap>(p => p
            .Add(x => x.Label, "Issues by area")
            .Add(x => x.MinBox, 32)
            .Add(x => x.Layout, PkHeatMapLayout.Rows)
            .Add(x => x.Scale, PkHeatMapScale.Intensity)
            .Add(x => x.MaxItems, 5)
            .Add(x => x.ValueFormat, PkHeatMapValueFormat.Compact)
            .Add(x => x.GroupBy, true)
            .Add(x => x.ShowTable, true));
        var el = cut.Find("pk-heat-map");

        Assert.Equal("Issues by area", el.GetAttribute("label"));
        Assert.Equal("32", el.GetAttribute("min-box"));
        Assert.Equal("rows", el.GetAttribute("layout"));
        Assert.Equal("intensity", el.GetAttribute("scale"));
        Assert.Equal("5", el.GetAttribute("max-items"));
        Assert.Equal("compact", el.GetAttribute("value-format"));
        Assert.True(el.HasAttribute("group-by"));
        Assert.True(el.HasAttribute("show-table"));
    }

    [Fact]
    public void Defaults_leave_the_flags_and_enums_off_and_keep_the_documented_min_box()
    {
        var el = Render<PkHeatMap>().Find("pk-heat-map");
        Assert.Equal("48", el.GetAttribute("min-box"));
        Assert.False(el.HasAttribute("group-by"));
        Assert.False(el.HasAttribute("show-table"));
        Assert.Null(el.GetAttribute("layout"));
        Assert.Null(el.GetAttribute("scale"));
    }

    [Fact]
    public void Empty_content_is_projected_into_the_empty_slot()
    {
        var cut = Render<PkHeatMap>(p => p.Add(x => x.EmptyContent, b => b.AddMarkupContent(0, "Nothing here")));
        Assert.Contains("Nothing here", cut.Find("[slot=empty]").TextContent);
    }

    [Fact]
    public async Task OnSelect_and_OnFocusItem_receive_the_item_id()
    {
        PkHeatSelectEventArgs? selected = null; PkHeatFocusItemEventArgs? focused = null;
        var cut = Render<PkHeatMap>(p => p.Add(x => x.OnSelect, e => selected = e).Add(x => x.OnFocusItem, e => focused = e));
        var el = cut.Find("pk-heat-map");

        await el.TriggerEventAsync("onpk-heat-focus-item", new PkHeatFocusItemEventArgs { Id = "auth" });
        await el.TriggerEventAsync("onpk-heat-select", new PkHeatSelectEventArgs { Id = "billing" });

        Assert.Equal("auth", focused!.Id);
        Assert.Equal("billing", selected!.Id);
    }
}
