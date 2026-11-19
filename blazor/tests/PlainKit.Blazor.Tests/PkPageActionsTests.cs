using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// The shared page actions model (#1943, the Blazor surface): the generated PkAction record, NewAction, ToolbarActions, Actions, FooterActions and ActionsCollapse
// written into the config, and OnAction by key. The element draws the buttons; these tests check what is sent and what a pk-action becomes.
public sealed class PkPageActionsTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkPageActionsTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private sealed record Order(string OrderNo);

    private static readonly PkAction[] Items =
    [
        new("export", "Export", Icon: "download", Hint: "As CSV"),
        new("csv", "CSV", Group: "Export as"),
        new("docs", "Docs", Href: "/docs", Disabled: false),
    ];

    private static JsonElement ConfigOf(string html) => JsonDocument.Parse(html).RootElement;

    [Fact]
    public void A_list_page_writes_NewAction_ToolbarActions_and_ActionsCollapse_into_the_config_without_nulls()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.NewAction, new PkAction("new", "New order", Icon: "plus")).Add(x => x.ToolbarActions, Items).Add(x => x.ActionsCollapse, "always"));
        var config = ConfigOf(cut.Find("pk-list-page").GetAttribute("config")!);

        Assert.Equal("always", config.GetProperty("actionsCollapse").GetString());
        Assert.Equal("new", config.GetProperty("newAction").GetProperty("key").GetString());
        var sent = config.GetProperty("toolbarActions");
        Assert.Equal(3, sent.GetArrayLength());
        Assert.Equal("As CSV", sent[0].GetProperty("hint").GetString());
        Assert.False(sent[0].TryGetProperty("href", out _));
        Assert.Equal("Export as", sent[1].GetProperty("group").GetString());
        Assert.Equal("/docs", sent[2].GetProperty("href").GetString());
        Assert.False(sent[2].GetProperty("disabled").GetBoolean());
    }

    [Fact]
    public void A_list_page_without_the_new_parameters_sends_none_of_the_keys()
    {
        var config = ConfigOf(Render<PkListPage<Order>>().Find("pk-list-page").GetAttribute("config") ?? "{}");
        Assert.False(config.TryGetProperty("newAction", out _));
        Assert.False(config.TryGetProperty("toolbarActions", out _));
        Assert.False(config.TryGetProperty("actionsCollapse", out _));
    }

    [Fact]
    public async Task A_list_page_toolbar_pk_action_raises_OnAction_with_the_key_and_a_row_action_does_not()
    {
        var keys = new List<string?>();
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.ToolbarActions, Items).Add(x => x.OnAction, e => keys.Add(e.Key)));

        await cut.Find("pk-list-page").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "export" });
        await cut.Find("pk-list-page").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "view", Id = "A-1" });
        Assert.Equal(["export"], keys);
    }

    [Fact]
    public void A_tool_page_merges_Actions_NewAction_and_ActionsCollapse_into_the_config_it_was_given()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Config, new { heading = "Tool" }).Add(x => x.Actions, Items).Add(x => x.NewAction, new PkAction("run2", "Again")).Add(x => x.ActionsCollapse, "tablet"));
        var config = ConfigOf(cut.Find("pk-tool-page").GetAttribute("config")!);

        Assert.Equal("Tool", config.GetProperty("heading").GetString());
        Assert.Equal("tablet", config.GetProperty("actionsCollapse").GetString());
        Assert.Equal("run2", config.GetProperty("newAction").GetProperty("key").GetString());
        Assert.Equal("csv", config.GetProperty("actions")[1].GetProperty("key").GetString());
    }

    [Fact]
    public async Task A_tool_page_pk_action_raises_OnAction_by_key()
    {
        string? key = null;
        var cut = Render<PkToolPage>(p => p.Add(x => x.Actions, Items).Add(x => x.OnAction, e => key = e.Key));
        await cut.Find("pk-tool-page").TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "csv" });
        Assert.Equal("csv", key);
    }

    [Fact]
    public void A_wizard_page_writes_FooterActions_into_the_config()
    {
        var cut = Render<PkWizardPage>(p => p.Add(x => x.FooterActions, [new PkAction("draft", "Save draft")]));
        var config = ConfigOf(cut.Find("pk-wizard-page").GetAttribute("config")!);
        Assert.Equal("draft", config.GetProperty("footerActions")[0].GetProperty("key").GetString());
    }
}
