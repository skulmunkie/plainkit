using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Callbacks the generator makes from a mapping's "events" list: every listed element event reaches its EventCallback with the typed detail.
public sealed class PkGeneratedCallbackTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkGeneratedCallbackTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task PropertyGrid_OnPropertyChange_receives_the_detail_of_pk_property_change()
    {
        PkPropertyChangeEventArgs? got = null;
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.OnPropertyChange, e => got = e));

        await cut.Find("pk-property-grid").TriggerEventAsync("onpk-property-change", new PkPropertyChangeEventArgs { Key = "radius" });

        Assert.NotNull(got);
        Assert.Equal("radius", got!.Key);
    }

    [Fact]
    public async Task Button_OnToggle_receives_the_detail_of_pk_toggle()
    {
        PkToggleEventArgs? got = null;
        var cut = Render<PkButton>(p => p.Add(x => x.OnToggle, e => got = e));

        await cut.Find("pk-button").TriggerEventAsync("onpk-toggle", new PkToggleEventArgs { Pressed = true, Value = "bold" });

        Assert.NotNull(got);
        Assert.True(got!.Pressed);
        Assert.Equal("bold", got.Value);
    }

    [Fact]
    public async Task Tooltip_OnShow_and_OnHide_are_raised_by_the_lifecycle_events()
    {
        int shown = 0, hidden = 0;
        var cut = Render<PkTooltip>(p => p.Add(x => x.OnShow, () => shown++).Add(x => x.OnHide, () => hidden++));

        await cut.Find("pk-tooltip").TriggerEventAsync("onpk-show", EventArgs.Empty);
        await cut.Find("pk-tooltip").TriggerEventAsync("onpk-hide", EventArgs.Empty);

        Assert.Equal(1, shown);
        Assert.Equal(1, hidden);
    }

    [Fact]
    public async Task Dialog_Drawer_and_SelectMenu_OnOpen_are_raised_by_pk_open()
    {
        int opened = 0;
        var dialog = Render<PkDialog>(p => p.Add(x => x.OnOpen, () => opened++));
        var drawer = Render<PkDrawer>(p => p.Add(x => x.OnOpen, () => opened++));
        var menu = Render<PkSelectMenu>(p => p.Add(x => x.OnOpen, () => opened++));

        await dialog.Find("pk-dialog").TriggerEventAsync("onpk-open", EventArgs.Empty);
        await drawer.Find("pk-drawer").TriggerEventAsync("onpk-open", EventArgs.Empty);
        await menu.Find("pk-select-menu").TriggerEventAsync("onpk-open", EventArgs.Empty);

        Assert.Equal(3, opened);
    }

    [Fact]
    public async Task SelectMenu_OnClose_receives_the_reason()
    {
        PkCloseEventArgs? got = null;
        var cut = Render<PkSelectMenu>(p => p.Add(x => x.OnClose, e => got = e));

        await cut.Find("pk-select-menu").TriggerEventAsync("onpk-close", new PkCloseEventArgs { Reason = "escape" });

        Assert.Equal("escape", got?.Reason);
    }

    [Fact]
    public async Task SortableItem_OnSortableDrop_receives_the_detail_and_Frame_OnFrameResize_the_height()
    {
        PkSortableDropEventArgs? drop = null;
        PkFrameResizeEventArgs? size = null;
        var item = Render<PkSortableItem>(p => p.Add(x => x.OnSortableDrop, e => drop = e));
        var frame = Render<PkFrame>(p => p.Add(x => x.OnFrameResize, e => size = e));

        await item.Find("pk-sortable-item").TriggerEventAsync("onpk-sortable-drop", new PkSortableDropEventArgs { Cancelled = true });
        await frame.Find("pk-frame").TriggerEventAsync("onpk-frame-resize", new PkFrameResizeEventArgs { Height = 240 });

        Assert.True(drop!.Cancelled);
        Assert.Equal(240, size!.Height);
    }
}
