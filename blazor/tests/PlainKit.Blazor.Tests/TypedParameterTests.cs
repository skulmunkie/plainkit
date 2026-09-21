using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Structured parameters (issue #9): a public type is sent as a JSON attribute in camelCase, an enum as its attribute value.
public sealed class TypedParameterTests : TestContext
{
    public TypedParameterTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Chart_data_is_sent_as_the_data_attribute_in_camel_case()
    {
        var data = new PkChartData
        {
            Labels = ["Mon", "Tue"],
            Series = [new PkChartSeries { Name = "Visits", Values = [3, 5.5] }],
        };
        var cut = RenderComponent<PkChart>(p => p.Add(x => x.Data, data));

        using var doc = JsonDocument.Parse(cut.Find("pk-chart").GetAttribute("data")!);
        Assert.Equal("Tue", doc.RootElement.GetProperty("labels")[1].GetString());
        var series = doc.RootElement.GetProperty("series")[0];
        Assert.Equal("Visits", series.GetProperty("name").GetString());
        Assert.Equal(5.5, series.GetProperty("values")[1].GetDouble());
    }

    [Fact]
    public void Chart_data_left_unset_leaves_the_attribute_off()
    {
        Assert.Null(RenderComponent<PkChart>().Find("pk-chart").GetAttribute("data"));
    }

    [Fact]
    public void Gallery_images_are_sent_as_the_images_attribute_and_leave_out_unset_fields()
    {
        var images = new List<PkGalleryImage>
        {
            new() { Src = "/a.png", Alt = "A", Primary = true },
            new() { Src = "/b.png", Alt = "B", Status = "Staged" },
        };
        var cut = RenderComponent<PkImageGallery>(p => p.Add(x => x.Images, images));

        using var doc = JsonDocument.Parse(cut.Find("pk-image-gallery").GetAttribute("images")!);
        var first = doc.RootElement[0];
        Assert.Equal("/a.png", first.GetProperty("src").GetString());
        Assert.True(first.GetProperty("primary").GetBoolean());
        Assert.False(first.TryGetProperty("status", out _));
        var second = doc.RootElement[1];
        Assert.Equal("Staged", second.GetProperty("status").GetString());
        Assert.False(second.TryGetProperty("primary", out _));
    }

    [Fact]
    public void A_table_column_serialises_its_enums_as_the_element_values()
    {
        var json = JsonSerializer.Serialize(
            new[] { new PkTableColumn { Key = "n", Label = "N", Type = PkTableColumnType.Number, Align = PkTableColumnAlign.End, Sortable = true } },
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.Equal("[{\"key\":\"n\",\"label\":\"N\",\"type\":\"number\",\"align\":\"end\",\"sortable\":true}]", json);
    }

    [Fact]
    public void The_dialog_tint_is_sent_as_its_attribute_value()
    {
        var cut = RenderComponent<PkDialog>(p => p.Add(x => x.Tint, PkDialogTint.Archived));

        Assert.Equal("archived", cut.Find("pk-dialog").GetAttribute("tint"));
    }

    [Fact]
    public void The_tooltip_sends_help_enrich_placement_and_title_as_the_elements_props()
    {
        var cut = RenderComponent<PkTooltip>(p => p
            .Add(x => x.Help, true)
            .Add(x => x.Placement, PkTooltipPlacement.Bottom)
            .Add(x => x.Title, "Tip"));
        var el = cut.Find("pk-tooltip");

        Assert.NotNull(el.GetAttribute("help"));
        Assert.Null(el.GetAttribute("enrich"));
        Assert.Equal("bottom", el.GetAttribute("placement"));
        Assert.Equal("Tip", el.GetAttribute("heading"));
    }
}
