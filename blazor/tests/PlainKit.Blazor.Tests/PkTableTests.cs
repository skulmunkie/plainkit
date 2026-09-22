using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// The hand-written PkTable<TItem> (issue #49): JSON attributes down, typed events up, cell templates as slot children.
public sealed class PkTableTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Order(int Number, string Customer, decimal Total, string Status);

    private static readonly Order[] Orders =
    [
        new(1042, "Ada", 12.5m, "Open"),
        new(1043, "Grace", 99m, "Shipped"),
    ];

    private static readonly PkTableColumn<Order>[] Columns =
    [
        new() { Key = "customer", Label = "Customer", Sortable = true },
        new() { Key = "total", Label = "Total", Type = PkTableColumnType.Number, Align = PkTableColumnAlign.End, Text = o => o.Total.ToString("0.00") },
        new() { Key = "status", Label = "Status", HidePhone = true, Cell = o => b => { b.OpenElement(0, "b"); b.AddContent(1, o.Status); b.CloseElement(); } },
    ];

    public PkTableTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private IRenderedComponent<PkTable<Order>> Render(Action<ComponentParameterCollectionBuilder<PkTable<Order>>>? more = null) =>
        Render<PkTable<Order>>(p =>
        {
            p.Add(x => x.Columns, Columns).Add(x => x.Items, Orders).Add(x => x.IdOf, o => o.Number.ToString());
            more?.Invoke(p);
        });

    [Fact]
    public void Columns_and_rows_are_camelCase_JSON_attributes_with_the_row_key()
    {
        var el = Render(p => p.Add(x => x.Manual, true).Add(x => x.Label, "Orders")).Find("pk-table");

        using var columns = JsonDocument.Parse(el.GetAttribute("columns")!);
        Assert.Equal("hidePhone", columns.RootElement[2].EnumerateObject().Last().Name);
        Assert.Equal("end", columns.RootElement[1].GetProperty("align").GetString());
        Assert.Equal("number", columns.RootElement[1].GetProperty("type").GetString());
        Assert.False(columns.RootElement[0].TryGetProperty("text", out _));

        using var rows = JsonDocument.Parse(el.GetAttribute("rows")!);
        Assert.Equal("1042", rows.RootElement[0].GetProperty("id").GetString());
        Assert.Equal("Ada", rows.RootElement[0].GetProperty("customer").GetString());
        Assert.Equal("12.50", rows.RootElement[0].GetProperty("total").GetString());   // the column's Text wins over the property
        Assert.Equal("id", el.GetAttribute("row-key"));
        Assert.True(el.HasAttribute("manual"));
        Assert.Equal("Orders", el.GetAttribute("label"));
    }

    [Fact]
    public void Without_IdOf_the_row_index_is_the_id()
    {
        var cut = Render<PkTable<Order>>(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, Orders));
        using var rows = JsonDocument.Parse(cut.Find("pk-table").GetAttribute("rows")!);
        Assert.Equal("1", rows.RootElement[1].GetProperty("id").GetString());
    }

    [Fact]
    public void A_cell_template_is_rendered_into_the_cell_slot_of_each_row()
    {
        var cut = Render();
        var slots = cut.FindAll("pk-table > span[slot]");

        Assert.Equal(["cell-1042-status", "cell-1043-status"], slots.Select(s => s.GetAttribute("slot")));
        Assert.Equal("Shipped", slots.Last().TextContent);
        Assert.NotNull(slots.First().QuerySelector("b"));
    }

    [Fact]
    public void Slots_and_the_detail_template_are_children_of_the_element_only_when_used()
    {
        var plain = Render();
        Assert.Empty(plain.FindAll("[slot=toolbar]"));
        Assert.Empty(plain.FindAll("[slot^=detail-]"));

        var full = Render(p => p
            .Add(x => x.Expandable, true)
            .Add(x => x.DetailTemplate, o => b => b.AddContent(0, "Lines of " + o.Number))
            .Add(x => x.ToolbarContent, b => b.AddContent(0, "tools"))
            .Add(x => x.FooterContent, b => b.AddContent(0, "pager"))
            .Add(x => x.EmptyContent, b => b.AddContent(0, "none")));
        Assert.Equal("Lines of 1043", full.Find("[slot=detail-1043]").TextContent);
        Assert.Equal("tools", full.Find("pk-cluster[slot=toolbar]").TextContent);
        Assert.Equal("pager", full.Find("[slot=footer]").TextContent);
        Assert.Equal("none", full.Find("[slot=empty]").TextContent);
        Assert.True(full.Find("pk-table").HasAttribute("expandable"));
    }

    [Fact]
    public void CurrentRow_is_a_host_set_attribute_and_absent_when_unset()
    {
        var cut = Render(p => p.Add(x => x.CurrentRow, "1043"));
        Assert.Equal("1043", cut.Find("pk-table").GetAttribute("current-row"));

        cut.Render(p => p.Add(x => x.CurrentRow, null));
        Assert.False(cut.Find("pk-table").HasAttribute("current-row"));
    }

    [Fact]
    public async Task A_sort_reaches_OnSort_and_the_two_way_parameters()
    {
        string? sort = null;
        PkSortDirection? dir = null;
        PkSortEventArgs? args = null;
        var cut = Render(p => p
            .Add(x => x.SortChanged, s => sort = s)
            .Add(x => x.SortDirectionChanged, d => dir = d)
            .Add(x => x.OnSort, e => args = e));

        await cut.Find("pk-table").TriggerEventAsync("onpk-sort", new PkSortEventArgs { Key = "customer", Direction = "descending" });

        Assert.Equal("customer", sort);
        Assert.Equal(PkSortDirection.Descending, dir);
        Assert.Equal("customer", args!.Key);
        Assert.Equal("customer", cut.Instance.Sort);
        Assert.Equal("descending", cut.Find("pk-table").GetAttribute("sort-dir"));
        Assert.Equal("customer", cut.Find("pk-table").GetAttribute("sort"));
    }

    [Fact]
    public async Task A_row_click_maps_the_id_back_to_the_item()
    {
        PkTableRowClickArgs<Order>? clicked = null;
        var cut = Render(p => p.Add(x => x.Clickable, true).Add(x => x.OnRowClick, a => clicked = a));

        await cut.Find("pk-table").TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "1043" });
        Assert.Equal("Grace", clicked!.Item.Customer);
        Assert.Equal("1043", clicked.Id);

        clicked = null;
        await cut.Find("pk-table").TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "nope" });
        Assert.Null(clicked);
    }

    [Fact]
    public async Task Selection_and_expansion_are_two_way_and_a_foreign_pk_select_is_ignored()
    {
        IReadOnlyList<string>? selected = null, expanded = null;
        PkTableRowExpandArgs<Order>? expandArgs = null;
        var cut = Render(p => p
            .Add(x => x.Selectable, true)
            .Add(x => x.SelectedChanged, s => selected = s)
            .Add(x => x.ExpandedChanged, e => expanded = e)
            .Add(x => x.OnRowExpand, a => expandArgs = a));
        var table = cut.Find("pk-table");

        await table.TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Value = "menu item" });   // bubbled from a menu in a slot
        Assert.Null(selected);

        await table.TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Selected = ["1042", "1043"] });
        Assert.Equal(["1042", "1043"], selected);
        Assert.Equal("[\"1042\",\"1043\"]", cut.Find("pk-table").GetAttribute("selected"));

        await table.TriggerEventAsync("onpk-row-expand", new PkRowExpandEventArgs { Id = "1042", Index = 0, Expanded = true });
        await table.TriggerEventAsync("onpk-row-expand", new PkRowExpandEventArgs { Id = "1043", Index = 1, Expanded = true });
        await table.TriggerEventAsync("onpk-row-expand", new PkRowExpandEventArgs { Id = "1042", Index = 0, Expanded = false });
        Assert.Equal(["1043"], expanded);
        Assert.False(expandArgs!.Expanded);
        Assert.Equal("Ada", expandArgs.Item.Customer);
    }

    [Fact]
    public async Task A_filter_reaches_Filters()
    {
        Dictionary<string, string>? filters = null;
        var cut = Render(p => p.Add(x => x.Filterable, true).Add(x => x.FiltersChanged, f => filters = f));

        await cut.Find("pk-table").TriggerEventAsync("onpk-filter", new PkFilterEventArgs { Filters = new() { ["customer"] = "ad" } });

        Assert.Equal("ad", filters!["customer"]);
    }

    [Fact]
    public void Rows_are_rebuilt_when_the_parameters_change_and_not_on_a_bare_re_render()
    {
        var cut = Render();
        var first = cut.Find("pk-table").GetAttribute("rows");
        var calls = JSInterop.Invocations.Count;

        cut.Render(p => p.Add(x => x.Items, new[] { Orders[0] }));
        var second = cut.Find("pk-table").GetAttribute("rows");

        Assert.NotEqual(first, second);
        Assert.Single(JsonDocument.Parse(second!).RootElement.EnumerateArray());
        Assert.Equal(calls, JSInterop.Invocations.Count);   // a parameter change is an attribute, never a JavaScript call
    }

    // The documented form (README, skill): a method group for OnRowClick needs TItem written out. TableTypeInference.razor compiles with it; the same
    // markup without TItem fails with CS1503 (checked by hand for issue #94, a failing compile cannot be a passing test).
    [Fact]
    public async Task A_method_group_handler_works_with_an_explicit_TItem()
    {
        var cut = Render<TableTypeInference>();
        await cut.Find("pk-table").TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "1" });
        Assert.Equal("Ada", cut.Instance.Opened?.Name);
    }
}
