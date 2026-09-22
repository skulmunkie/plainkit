using System.Reflection;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue #49: @onpk-sort on a raw <pk-table> in Razor. Blazor delivers a custom event only when it is registered in the browser
// (Blazor.registerCustomEventType, PlainKit.Blazor.lib.module.js, checked by scripts/tests/generate-blazor.test.mjs) AND an [EventHandler]
// attribute class maps it to an EventArgs type (EventHandlers, generated for every pk-* event of every element). This is the second half.
public sealed class RawEventTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public RawEventTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Raw_markup_handlers_are_event_handlers_not_literal_attributes()
    {
        var cut = Render<RawElementHost>();

        foreach (var name in new[] { "pk-table", "pk-pagination", "pk-dialog" })
            Assert.DoesNotContain(cut.Find(name).Attributes, a => a.Name.StartsWith('@'));
        Assert.Contains("onpk-sort", cut.Markup);
    }

    [Fact]
    public async Task A_raw_table_reaches_the_component_with_typed_args()
    {
        var cut = Render<RawElementHost>();
        var table = cut.Find("pk-table");

        await table.TriggerEventAsync("onpk-sort", new PkSortEventArgs { Key = "name", Direction = "descending" });
        await table.TriggerEventAsync("onpk-filter", new PkFilterEventArgs { Filters = new() { ["name"] = "ad" } });
        await table.TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "7" });
        await table.TriggerEventAsync("onpk-row-expand", new PkRowExpandEventArgs { Id = "7", Index = 0, Expanded = true });
        await cut.Find("pk-pagination").TriggerEventAsync("onpk-page", new PkPageEventArgs { Page = 2 });
        await cut.Find("pk-dialog").TriggerEventAsync("onpk-open", new PkOpenEventArgs());

        var host = cut.Instance;
        Assert.Equal(("name", "descending"), (host.Sorted!.Key, host.Sorted.Direction));
        Assert.Equal("ad", host.Filtered!.Filters!["name"]);
        Assert.Equal("7", host.Clicked!.Id);
        Assert.True(host.Expanded!.Expanded);
        Assert.Equal(2, host.Paged!.Page);
        Assert.Equal(1, host.Opened);
    }

    [Fact]
    public void Every_pk_event_of_the_manifest_has_an_EventHandler_attribute_with_its_args_type()
    {
        var handlers = typeof(EventHandlers).GetCustomAttributes<EventHandlerAttribute>().ToDictionary(a => a.AttributeName, a => a.EventArgsType);

        Assert.Equal(typeof(PkSortEventArgs), handlers["onpk-sort"]);
        Assert.Equal(typeof(PkFilterEventArgs), handlers["onpk-filter"]);
        Assert.Equal(typeof(PkRowClickEventArgs), handlers["onpk-row-click"]);
        Assert.Equal(typeof(PkRowExpandEventArgs), handlers["onpk-row-expand"]);
        Assert.Equal(typeof(PkSelectEventArgs), handlers["onpk-select"]);
        // an element no component listens for (pk-stat's pk-activate, pk-split-button's pk-menu-toggle) is mapped too
        Assert.Equal(typeof(PkActivateEventArgs), handlers["onpk-activate"]);
        Assert.Equal(typeof(PkMenuToggleEventArgs), handlers["onpk-menu-toggle"]);
        Assert.All(handlers.Keys, k => Assert.StartsWith("onpk-", k));
    }
}
