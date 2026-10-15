using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// State parameters whose element commits through an event report it through XChanged, so @bind-X keeps component state in step (#1378).
public sealed class PkBindTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkBindTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task Tabs_ValueChanged_follows_pk_tab_change()
    {
        string? got = null;
        var cut = Render<PkTabs>(p => p.Add(x => x.Value, "a").Add(x => x.ValueChanged, EventCallback.Factory.Create<string?>(this, v => got = v)));
        await cut.Find("pk-tabs").TriggerEventAsync("onpk-tab-change", new PkTabChangeEventArgs { Value = "b", Previous = "a" });
        Assert.Equal("b", got);
        Assert.Equal("b", cut.Instance.Value);
    }

    [Fact]
    public async Task TreeItem_ExpandedChanged_follows_pk_toggle()
    {
        bool? got = null;
        var cut = Render<PkTreeItem>(p => p.Add(x => x.ExpandedChanged, EventCallback.Factory.Create<bool>(this, v => got = v)));
        await cut.Find("pk-tree-item").TriggerEventAsync("onpk-toggle", new PkToggleEventArgs { Expanded = true });
        Assert.True(got);
    }

    [Fact]
    public async Task Lightbox_IndexChanged_follows_pk_change()
    {
        int? got = null;
        var cut = Render<PkLightbox>(p => p.Add(x => x.IndexChanged, EventCallback.Factory.Create<int>(this, v => got = v)));
        await cut.Find("pk-lightbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Index = 2 });
        Assert.Equal(2, got);
    }

    [Fact]
    public async Task SplitButton_OpenChanged_follows_pk_menu_toggle()
    {
        bool? got = null;
        var cut = Render<PkSplitButton>(p => p.Add(x => x.OpenChanged, EventCallback.Factory.Create<bool>(this, v => got = v)));
        await cut.Find("pk-split-button").TriggerEventAsync("onpk-menu-toggle", new PkMenuToggleEventArgs { Open = true });
        Assert.True(got);
    }

    [Fact]
    public async Task SelectMenu_OpenChanged_follows_pk_open_and_pk_close()
    {
        var seen = new List<bool>();
        var cut = Render<PkSelectMenu>(p => p.Add(x => x.OpenChanged, EventCallback.Factory.Create<bool>(this, v => seen.Add(v))));
        await cut.Find("pk-select-menu").TriggerEventAsync("onpk-open", EventArgs.Empty);
        await cut.Find("pk-select-menu").TriggerEventAsync("onpk-close", new PkCloseEventArgs { Reason = "escape" });
        Assert.Equal(new[] { true, false }, seen);
    }

    [Fact]
    public async Task ContextMenu_OpenChanged_follows_pk_open_and_pk_close()
    {
        var seen = new List<bool>();
        var cut = Render<PkContextMenu>(p => p.Add(x => x.OpenChanged, EventCallback.Factory.Create<bool>(this, v => seen.Add(v))));
        await cut.Find("pk-context-menu").TriggerEventAsync("onpk-open", new PkOpenEventArgs());
        await cut.Find("pk-context-menu").TriggerEventAsync("onpk-close", new PkCloseEventArgs { Reason = "escape" });
        Assert.Equal(new[] { true, false }, seen);
    }

    [Fact]
    public async Task Navbar_OpenChanged_follows_pk_toggle()
    {
        bool? got = null;
        var cut = Render<PkNavbar>(p => p.Add(x => x.OpenChanged, EventCallback.Factory.Create<bool>(this, v => got = v)));
        await cut.Find("pk-navbar").TriggerEventAsync("onpk-toggle", new PkToggleEventArgs { Open = true });
        Assert.True(got);
    }

    [Fact]
    public async Task Calendar_MonthChanged_follows_pk_month()
    {
        DateOnly? got = null;
        var cut = Render<PkCalendar>(p => p.Add(x => x.MonthChanged, EventCallback.Factory.Create<DateOnly?>(this, v => got = v)));
        await cut.Find("pk-calendar").TriggerEventAsync("onpk-month", new PkMonthEventArgs { Month = "2026-03" });
        Assert.Equal(new DateOnly(2026, 3, 1), got);
    }

    [Fact]
    public async Task Button_PressedChanged_follows_pk_toggle()
    {
        bool? got = null;
        var cut = Render<PkButton>(p => p.Add(x => x.PressedChanged, EventCallback.Factory.Create<bool>(this, v => got = v)));
        await cut.Find("pk-button").TriggerEventAsync("onpk-toggle", new PkToggleEventArgs { Pressed = true });
        Assert.True(got);
    }
}
