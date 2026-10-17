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
    public void Without_them_no_slot_wrapper_is_drawn()
    {
        var cut = Render<PkListPage<Order>>();

        Assert.Empty(cut.FindAll("[slot='actions']"));
        Assert.Empty(cut.FindAll("[slot='toolbar']"));
    }
}
