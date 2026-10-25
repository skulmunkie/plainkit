using Bunit;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1387: the canvas events reach their typed EventCallbacks, and pk-view-change also drives the two-way bound Zoom, PanX and PanY.
public sealed class PkCanvasEventTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkCanvasEventTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task pk_view_change_raises_OnViewChange_and_updates_the_bound_view()
    {
        double zoom = 1, x = 0, y = 0;
        PkViewChangeEventArgs? raised = null;
        var cut = Render<PkCanvas>(p => p
            .Add(c => c.ZoomChanged, v => zoom = v)
            .Add(c => c.PanXChanged, v => x = v)
            .Add(c => c.PanYChanged, v => y = v)
            .Add(c => c.OnViewChange, e => raised = e));

        await cut.InvokeAsync(() => cut.Find("pk-canvas").TriggerEventAsync("onpk-view-change", new PkViewChangeEventArgs { X = 5, Y = 7, Zoom = 2 }));

        Assert.Equal(2, raised!.Zoom);
        Assert.Equal((2d, 5d, 7d), (zoom, x, y));
    }

    [Fact]
    public async Task pk_canvas_pick_and_pk_canvas_key_raise_OnPick_and_OnKey()
    {
        PkCanvasPickEventArgs? pick = null;
        PkCanvasKeyEventArgs? key = null;
        var cut = Render<PkCanvas>(p => p
            .Add(c => c.OnPick, e => pick = e)
            .Add(c => c.OnKey, e => key = e));
        var el = cut.Find("pk-canvas");

        await cut.InvokeAsync(() => el.TriggerEventAsync("onpk-canvas-pick", new PkCanvasPickEventArgs { Additive = true }));
        await cut.InvokeAsync(() => el.TriggerEventAsync("onpk-canvas-key", new PkCanvasKeyEventArgs { Key = "Delete", ShiftKey = false }));

        Assert.True(pick!.Additive);
        Assert.Equal("Delete", key!.Key);
    }

    [Fact]
    public async Task pk_canvas_move_raises_OnMove_and_ReadOnly_renders_the_attribute()
    {
        PkCanvasMoveEventArgs? moved = null;
        var cut = Render<PkCanvas>(p => p
            .Add(c => c.ReadOnly, true)
            .Add(c => c.OnMove, e => moved = e));
        var el = cut.Find("pk-canvas");

        await cut.InvokeAsync(() => el.TriggerEventAsync("onpk-canvas-move", new PkCanvasMoveEventArgs { Done = true }));

        Assert.True(moved!.Done);
        Assert.True(el.HasAttribute("readonly"));
    }

    [Fact]
    public async Task pk_canvas_resize_raises_OnResize()
    {
        PkCanvasResizeEventArgs? resized = null;
        var cut = Render<PkCanvas>(p => p.Add(c => c.OnResize, e => resized = e));

        await cut.InvokeAsync(() => cut.Find("pk-canvas").TriggerEventAsync("onpk-canvas-resize", new PkCanvasResizeEventArgs { Id = "a", W = 120, H = 72, Done = true }));

        Assert.Equal("a", resized!.Id);
        Assert.Equal(120, resized.W);
        Assert.True(resized.Done);
    }
}
