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

    [Fact]
    public void Without_them_no_slot_wrapper_is_drawn()
    {
        var cut = Render<PkListPage<Order>>();

        Assert.Empty(cut.FindAll("[slot='actions']"));
        Assert.Empty(cut.FindAll("[slot='toolbar']"));
    }
}
