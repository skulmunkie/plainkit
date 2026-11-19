using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Row actions (#2046, the Blazor surface): RowActions, RowActionsMax and the typed OnRowAction on PkDataTable and PkListPage. The element draws the icon column and
// owns the confirm; these tests check what is sent to it and what an element's pk-action becomes.
public sealed class PkRowActionsTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkRowActionsTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private sealed record Order(string OrderNo, int Total);

    private static readonly PkRowAction[] Actions =
    [
        new("view", "View", Icon: "search"),
        new("delete", "Delete", Icon: "trash", Variant: "warn", Confirm: new PkRowActionConfirm("Delete {title}?", "This cannot be undone.")),
        new("archive", "Archive", Confirm: false, Hint: "Keeps the order"),
    ];

    private static readonly PkListResult<Order> Rows = new([new("A-1", 5), new("A-2", 7)], 2);

    private async Task Ask<T>(IRenderedComponent<T> cut) where T : IComponent
    {
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"], i => i.Arguments[1] as string == "load").Arguments[2]);
        await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery()));
    }

    [Fact]
    public void A_data_table_sends_the_actions_as_the_shared_item_without_nulls_and_the_max()
    {
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }]).Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.RowActions, Actions).Add(x => x.RowActionsMax, 2));
        var el = cut.Find("pk-data-table");

        Assert.Equal("2", el.GetAttribute("row-actions-max"));
        var sent = JsonDocument.Parse(el.GetAttribute("row-actions")!).RootElement;
        Assert.Equal(3, sent.GetArrayLength());
        Assert.Equal("view", sent[0].GetProperty("key").GetString());
        Assert.Equal("search", sent[0].GetProperty("icon").GetString());
        Assert.False(sent[0].TryGetProperty("variant", out _));
        Assert.Equal("warn", sent[1].GetProperty("variant").GetString());
        Assert.Equal("Delete {title}?", sent[1].GetProperty("confirm").GetProperty("heading").GetString());
        Assert.False(sent[2].GetProperty("confirm").GetBoolean());
        Assert.Equal("Keeps the order", sent[2].GetProperty("hint").GetString());
    }

    [Fact]
    public void Without_RowActions_nothing_is_sent()
    {
        var el = Render<PkDataTable<Order>>(p => p.Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }]).Add(x => x.IdOf, o => o.OrderNo)).Find("pk-data-table");
        Assert.False(el.HasAttribute("row-actions"));
        Assert.False(el.HasAttribute("row-actions-max"));
    }

    [Fact]
    public async Task A_data_table_pk_action_with_a_row_id_raises_OnRowAction_with_the_loaded_item()
    {
        PkRowActionArgs<Order>? seen = null;
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.Load, _ => Task.FromResult(Rows)).Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }])
            .Add(x => x.IdOf, o => o.OrderNo).Add(x => x.RowActions, Actions).Add(x => x.OnRowAction, a => seen = a));
        await Ask(cut);

        await cut.Find("pk-data-table").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "delete", Id = "A-2" });
        Assert.Equal(new PkRowActionArgs<Order>("delete", "A-2", new Order("A-2", 7)), seen);
    }

    [Fact]
    public async Task A_pk_action_without_a_row_or_for_a_row_that_is_not_loaded_raises_nothing()
    {
        var calls = 0;
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.Load, _ => Task.FromResult(Rows)).Add(x => x.Columns, [new() { Key = "orderNo", Label = "No" }])
            .Add(x => x.IdOf, o => o.OrderNo).Add(x => x.OnRowAction, _ => calls++));
        await Ask(cut);

        await cut.Find("pk-data-table").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "save" });                      // a title-bar action
        await cut.Find("pk-data-table").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "delete", Id = "nope" });      // not a loaded row
        Assert.Equal(0, calls);
    }

    [Fact]
    public void A_list_page_puts_the_actions_and_the_max_in_the_config_under_the_element_keys()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.RowActions, Actions).Add(x => x.RowActionsMax, 4));
        var config = JsonDocument.Parse(cut.Find("pk-list-page").GetAttribute("config")!).RootElement;

        Assert.Equal(4, config.GetProperty("rowActionsMax").GetInt32());
        var sent = config.GetProperty("rowActions");
        Assert.Equal("Delete", sent[1].GetProperty("label").GetString());
        Assert.Equal("This cannot be undone.", sent[1].GetProperty("confirm").GetProperty("message").GetString());
        Assert.False(sent[0].TryGetProperty("hint", out _));
    }

    [Fact]
    public async Task A_list_page_pk_action_raises_OnRowAction_with_the_item_and_ignores_the_title_bar()
    {
        var seen = new List<PkRowActionArgs<Order>>();
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, _ => Task.FromResult(Rows)).Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.RowActions, Actions).Add(x => x.OnRowAction, a => seen.Add(a)));
        await Ask(cut);

        await cut.Find("pk-list-page").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "view", Id = "A-1" });
        await cut.Find("pk-list-page").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "new" });
        Assert.Equal([new PkRowActionArgs<Order>("view", "A-1", new Order("A-1", 5))], seen);
    }
}
