using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkListPage (generated from blazor/mappings/list-page.json): the header and toolbar slots, Text columns, and the reload and initial query surface.
public sealed class PkListPageTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkListPageTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private sealed record Order(string OrderNo, int Total, string? Channel = null);

    [Fact]
    public void ActionsContent_and_ToolbarContent_fill_the_actions_and_toolbar_slots()
    {
        var cut = Render<PkListPage<Order>>(p => p
            .Add(x => x.ActionsContent, b => b.AddMarkupContent(0, "<button id=\"sync\">Sync</button>"))
            .Add(x => x.ToolbarContent, b => b.AddMarkupContent(0, "<button id=\"export\">Export</button>")));

        Assert.Equal("Sync", cut.Find("[slot='actions'] #sync").TextContent);
        Assert.Equal("Export", cut.Find("[slot='toolbar'] #export").TextContent);
    }

    [Fact]
    public void BeforeListContent_fills_the_before_list_slot()
    {
        var cut = Render<PkListPage<Order>>(p => p
            .Add(x => x.BeforeListContent, b => b.AddMarkupContent(0, "<pk-alert id=\"sync\">Last sync</pk-alert>")));

        Assert.Equal("Last sync", cut.Find("[slot='before-list'] #sync").TextContent);
    }

    private async Task<JsonElement> LoadedRows(IRenderedComponent<PkListPage<Order>> cut)
    {
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"], i => i.Arguments[1] as string == "load").Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery()));
        return JsonSerializer.SerializeToElement(result).GetProperty("rows");
    }

    [Fact]
    public async Task A_column_with_Text_and_no_Cell_fills_its_key_in_the_loaded_rows()
    {
        var cut = Render<PkListPage<Order>>(p => p
            .Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }, new() { Key = "amount", Label = "Amount", Text = o => $"EUR {o.Total}" }, new() { Key = "Total", Label = "Total" }])
            .Add(x => x.Load, r => Task.FromResult(new PkListResult<Order>([new("A-1", 5)], 1)))
            .Add(x => x.IdOf, o => o.OrderNo));

        var row = (await LoadedRows(cut))[0];

        Assert.Equal("A-1", row.GetProperty("orderNo").GetString());
        Assert.Equal("EUR 5", row.GetProperty("amount").GetString());
        Assert.Equal(5, row.GetProperty("Total").GetInt32());
    }

    [Fact]
    public async Task Without_typed_Columns_the_rows_are_the_items()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, r => Task.FromResult(new PkListResult<Order>([new("A-1", 5)], 1))));

        var row = (await LoadedRows(cut))[0];

        Assert.Contains("A-1", row.GetRawText());
    }

    private static JsonElement ConfigOf(IRenderedComponent<PkListPage<Order>> cut) => JsonDocument.Parse(cut.Find("pk-list-page").GetAttribute("config")!).RootElement;

    [Fact]
    public void The_Initial_parameters_go_into_the_config_next_to_the_columns()
    {
        var cut = Render<PkListPage<Order>>(p => p
            .Add(x => x.Config, "{\"label\":\"Orders\",\"search\":\"old\"}")
            .Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }])
            .Add(x => x.InitialSearch, "acme")
            .Add(x => x.InitialFilters, new Dictionary<string, string> { ["channel"] = "ebay" })
            .Add(x => x.InitialSortKey, "total")
            .Add(x => x.InitialDescending, true)
            .Add(x => x.InitialPage, 3));

        var config = ConfigOf(cut);

        Assert.Equal("Orders", config.GetProperty("label").GetString());
        Assert.Equal("acme", config.GetProperty("search").GetString());
        Assert.Equal("ebay", config.GetProperty("filterValues").GetProperty("channel").GetString());
        Assert.Equal("total", config.GetProperty("sort").GetString());
        Assert.Equal("descending", config.GetProperty("sortDir").GetString());
        Assert.Equal(3, config.GetProperty("page").GetInt32());
        Assert.Equal("orderNo", config.GetProperty("columns")[0].GetProperty("key").GetString());
    }

    [Fact]
    public void Without_Initial_parameters_the_config_carries_no_query_keys()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }]).Add(x => x.InitialDescending, false));

        var config = ConfigOf(cut);

        foreach (var key in new[] { "search", "filterValues", "sort", "sortDir", "page" }) Assert.False(config.TryGetProperty(key, out _), key);
    }

    [Fact]
    public void Initial_parameters_alone_leave_a_plain_config_intact()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Config, "{\"label\":\"Orders\"}").Add(x => x.InitialSearch, "acme"));

        var config = ConfigOf(cut);

        Assert.Equal("Orders", config.GetProperty("label").GetString());
        Assert.Equal("acme", config.GetProperty("search").GetString());
    }

    [Fact]
    public async Task ReloadAsync_asks_the_element_to_load_the_current_page_again()
    {
        var cut = Render<PkListPage<Order>>();

        await cut.InvokeAsync(() => cut.Instance.ReloadAsync());

        var call = Assert.Single(_bridge.Invocations["call"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
        Assert.Equal("refresh", call.Arguments[1]);
    }

    [Fact]
    public void Without_them_no_slot_wrapper_is_drawn()
    {
        var cut = Render<PkListPage<Order>>();

        Assert.Empty(cut.FindAll("[slot='actions']"));
        Assert.Empty(cut.FindAll("[slot='toolbar']"));
    }
}
