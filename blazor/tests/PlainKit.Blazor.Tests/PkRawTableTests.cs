using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 228: HeadContent/ChildContent/FootContent composed into pk-table's raw (slotted) default slot. No element of its own.
public sealed class PkRawTableTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkRawTableTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void HeadContent_ChildContent_and_FootContent_compose_into_one_table_inside_pk_table()
    {
        var cut = Render<PkRawTable>(p => p
            .Add(x => x.Label, "Orders")
            .Add(x => x.HeadContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><th>Number</th></tr>")))
            .Add(x => x.ChildContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><td>PO 1042</td></tr>")))
            .Add(x => x.FootContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><td>1 row</td></tr>"))));

        var table = cut.Find("pk-table");
        Assert.Equal("Orders", table.GetAttribute("label"));
        var raw = table.QuerySelector("table");
        Assert.NotNull(raw);
        Assert.Contains("Number", raw!.QuerySelector("thead")!.TextContent);
        Assert.Contains("PO 1042", raw.QuerySelector("tbody")!.TextContent);
        Assert.Contains("1 row", raw.QuerySelector("tfoot")!.TextContent);
    }

    [Fact]
    public void HeadContent_and_FootContent_are_optional_thead_and_tfoot_are_left_out_when_unset()
    {
        var cut = Render<PkRawTable>(p => p.Add(x => x.ChildContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><td>x</td></tr>"))));
        var raw = cut.Find("table");
        Assert.Null(raw.QuerySelector("thead"));
        Assert.Null(raw.QuerySelector("tfoot"));
        Assert.NotNull(raw.QuerySelector("tbody"));
    }

    [Fact]
    public void Caption_and_Flow_are_sent_straight_through_to_the_element()
    {
        var cut = Render<PkRawTable>(p => p
            .Add(x => x.Caption, "Recent orders")
            .Add(x => x.Flow, true)
            .Add(x => x.ChildContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><td>x</td></tr>"))));
        var table = cut.Find("pk-table");
        Assert.Equal("Recent orders", table.GetAttribute("caption"));
        Assert.NotNull(table.GetAttribute("flow"));
    }

    [Fact]
    public void Chrome_parameters_shared_with_PkTable_are_sent_straight_through_to_the_element()
    {
        var cut = Render<PkRawTable>(p => p
            .Add(x => x.Striped, true)
            .Add(x => x.Hover, true)
            .Add(x => x.Bordered, true)
            .Add(x => x.StickyHeader, true)
            .Add(x => x.StickyColumn, true)
            .Add(x => x.MaxHeight, "24rem")
            .Add(x => x.ChildContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><td>x</td></tr>"))));
        var table = cut.Find("pk-table");
        Assert.NotNull(table.GetAttribute("striped"));
        Assert.NotNull(table.GetAttribute("hover"));
        Assert.NotNull(table.GetAttribute("bordered"));
        Assert.NotNull(table.GetAttribute("sticky-header"));
        Assert.NotNull(table.GetAttribute("sticky-column"));
        Assert.Equal("24rem", table.GetAttribute("max-height"));
    }

    [Fact]
    public void ToolbarContent_CaptionContent_and_FooterContent_are_wrapped_in_their_named_slots()
    {
        var cut = Render<PkRawTable>(p => p
            .Add(x => x.ChildContent, (RenderFragment)(b => b.AddMarkupContent(0, "<tr><td>x</td></tr>")))
            .Add(x => x.ToolbarContent, (RenderFragment)(b => b.AddMarkupContent(0, "<button>Add</button>")))
            .Add(x => x.CaptionContent, (RenderFragment)(b => b.AddMarkupContent(0, "<strong>Orders</strong>")))
            .Add(x => x.FooterContent, (RenderFragment)(b => b.AddMarkupContent(0, "<pk-pagination></pk-pagination>"))));
        var table = cut.Find("pk-table");
        Assert.Equal("toolbar", table.QuerySelector("[slot=toolbar]")!.GetAttribute("slot"));
        Assert.Equal("caption", table.QuerySelector("[slot=caption]")!.GetAttribute("slot"));
        Assert.Equal("footer", table.QuerySelector("[slot=footer]")!.GetAttribute("slot"));
        Assert.NotNull(table.QuerySelector("[slot=toolbar] button"));
        Assert.NotNull(table.QuerySelector("[slot=caption] strong"));
        Assert.NotNull(table.QuerySelector("[slot=footer] pk-pagination"));
    }

    static RenderFragment Row => b => b.AddMarkupContent(0, "<tr><td>x</td></tr>");

    [Fact]
    public void Class_and_attributes_reach_the_frame_and_TableClass_reaches_the_inner_table()
    {
        var cut = Render<PkRawTable>(p => p
            .Add(x => x.ChildContent, Row)
            .Add(x => x.TableClass, "moves")
            .AddUnmatched("class", "mt-4")
            .AddUnmatched("data-x", "1"));
        var table = cut.Find("pk-table");
        Assert.Contains("mt-4", table.GetAttribute("class"));
        Assert.Equal("1", table.GetAttribute("data-x"));
        Assert.Equal("moves", cut.Find("table").GetAttribute("class"));
    }

    [Fact]
    public void IsEmpty_shows_EmptyText_or_EmptyContent_instead_of_the_table()
    {
        var text = Render<PkRawTable>(p => p.Add(x => x.ChildContent, Row).Add(x => x.IsEmpty, true).Add(x => x.EmptyText, "No rows"));
        Assert.Empty(text.FindAll("pk-table"));
        Assert.Contains("No rows", text.Markup);
        var content = Render<PkRawTable>(p => p.Add(x => x.ChildContent, Row).Add(x => x.IsEmpty, true).Add(x => x.EmptyText, "no")
            .Add(x => x.EmptyContent, (RenderFragment)(b => b.AddMarkupContent(0, "<em>Custom</em>"))));
        Assert.NotNull(content.Find("em"));
        Assert.DoesNotContain(">no<", content.Markup);
    }

    [Fact]
    public void IsEmpty_without_empty_content_still_renders_the_table_and_not_empty_renders_it_too()
    {
        Assert.NotNull(Render<PkRawTable>(p => p.Add(x => x.ChildContent, Row).Add(x => x.IsEmpty, true)).Find("pk-table"));
        Assert.NotNull(Render<PkRawTable>(p => p.Add(x => x.ChildContent, Row).Add(x => x.EmptyText, "No rows")).Find("pk-table"));
    }
}
