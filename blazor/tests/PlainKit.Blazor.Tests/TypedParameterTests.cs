using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Structured parameters (issue #9): a public type is sent as a JSON attribute in camelCase, an enum as its attribute value.
public sealed class TypedParameterTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

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
        var cut = Render<PkChart>(p => p.Add(x => x.Data, data));

        using var doc = JsonDocument.Parse(cut.Find("pk-chart").GetAttribute("data")!);
        Assert.Equal("Tue", doc.RootElement.GetProperty("labels")[1].GetString());
        var series = doc.RootElement.GetProperty("series")[0];
        Assert.Equal("Visits", series.GetProperty("name").GetString());
        Assert.Equal(5.5, series.GetProperty("values")[1].GetDouble());
    }

    [Fact]
    public void Chart_data_left_unset_leaves_the_attribute_off()
    {
        Assert.Null(Render<PkChart>().Find("pk-chart").GetAttribute("data"));
    }

    [Fact]
    public void Gallery_images_are_sent_as_the_images_attribute_and_leave_out_unset_fields()
    {
        var images = new List<PkGalleryImage>
        {
            new() { Src = "/a.png", Alt = "A", Primary = true },
            new() { Src = "/b.png", Alt = "B", Status = "Staged" },
        };
        var cut = Render<PkImageGallery>(p => p.Add(x => x.Images, images));

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

    // Issue #77: the chart's data and the gallery's images are typed parameters now, and the attribute is byte for byte what the object? parameter sent.
    [Fact]
    public void Chart_data_and_gallery_images_are_typed_parameters_not_object()
    {
        Assert.Equal(typeof(PkChartData), typeof(PkChart).GetProperty(nameof(PkChart.Data))!.PropertyType);
        Assert.Equal(typeof(IReadOnlyList<PkGalleryImage>), typeof(PkImageGallery).GetProperty(nameof(PkImageGallery.Images))!.PropertyType);
    }

    [Fact]
    public void No_generated_component_has_an_untyped_object_parameter()
    {
        var untyped = typeof(PkChart).Assembly.GetTypes()
            .Where(t => typeof(PkElementBase).IsAssignableFrom(t) && t.Namespace == "PlainKit.Blazor" && !t.IsAbstract)
            .SelectMany(t => t.GetProperties().Where(pr => pr.PropertyType == typeof(object) && pr.GetCustomAttributes(typeof(Microsoft.AspNetCore.Components.ParameterAttribute), false).Length > 0)
                .Select(pr => t.Name + "." + pr.Name))
            .ToList();

        Assert.Empty(untyped);
    }

    [Fact]
    public void The_typed_chart_data_and_images_serialise_exactly_as_before()
    {
        var chart = Render<PkChart>(p => p.Add(x => x.Data, new PkChartData { Labels = ["Mon", "Tue"], Series = [new PkChartSeries { Name = "Visits", Values = [3, 5.5] }] }));
        Assert.Equal("""{"labels":["Mon","Tue"],"series":[{"name":"Visits","values":[3,5.5]}]}""", chart.Find("pk-chart").GetAttribute("data"));

        IReadOnlyList<PkGalleryImage> images = [new PkGalleryImage { Src = "/a.png", Alt = "A", Primary = true }, new PkGalleryImage { Src = "/b.png", Alt = "B", Status = "Staged" }];
        var gallery = Render<PkImageGallery>(p => p.Add(x => x.Images, images));
        Assert.Equal("""[{"src":"/a.png","alt":"A","primary":true},{"src":"/b.png","alt":"B","status":"Staged"}]""", gallery.Find("pk-image-gallery").GetAttribute("images"));
    }

    [Fact]
    public void The_dialog_tint_is_sent_as_its_attribute_value()
    {
        var cut = Render<PkDialog>(p => p.Add(x => x.Tint, PkDialogTint.Archived));

        Assert.Equal("archived", cut.Find("pk-dialog").GetAttribute("tint"));
    }

    [Fact]
    public void The_tooltip_sends_help_enrich_placement_and_title_as_the_elements_props()
    {
        var cut = Render<PkTooltip>(p => p
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
