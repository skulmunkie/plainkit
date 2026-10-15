using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1388: the drag-and-drop events of pk-image-gallery and pk-kanban reach their EventCallbacks with the detail fields.
public sealed class DragDropEventTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public DragDropEventTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task ImageGallery_raises_OnReorder_OnRemove_and_OnPrimaryChange_with_their_detail()
    {
        PkReorderEventArgs? reorder = null; PkRemoveEventArgs? remove = null; PkPrimaryChangeEventArgs? primary = null;
        var cut = Render<PkImageGallery>(p => p
            .Add(x => x.OnReorder, e => reorder = e)
            .Add(x => x.OnRemove, e => remove = e)
            .Add(x => x.OnPrimaryChange, e => primary = e));
        var el = cut.Find("pk-image-gallery");

        await el.TriggerEventAsync("onpk-reorder", new PkReorderEventArgs { Order = new[] { "b", "a" }, From = 1, To = 0, Item = "b" });
        await el.TriggerEventAsync("onpk-remove", new PkRemoveEventArgs { Index = 2, Src = "c" });
        await el.TriggerEventAsync("onpk-primary-change", new PkPrimaryChangeEventArgs { Index = 1, Src = "b", Previous = 0 });

        Assert.Equal(new[] { "b", "a" }, reorder!.Order);
        Assert.Equal(1, reorder.From); Assert.Equal(0, reorder.To); Assert.Equal("b", reorder.Item);
        Assert.Equal(2, remove!.Index); Assert.Equal("c", remove.Src);
        Assert.Equal(1, primary!.Index); Assert.Equal(0, primary.Previous);
    }

    [Fact]
    public async Task ImageGallery_OnAdd_receives_the_names()
    {
        PkAddEventArgs? added = null;
        var cut = Render<PkImageGallery>(p => p.Add(x => x.OnAdd, e => added = e));
        await cut.Find("pk-image-gallery").TriggerEventAsync("onpk-add", new PkAddEventArgs { Names = new[] { "a.png" } });
        Assert.Equal(new[] { "a.png" }, added!.Names);
    }

    [Fact]
    public async Task Kanban_OnMove_receives_card_columns_and_indexes()
    {
        PkMoveEventArgs? moved = null;
        var cut = Render<PkKanban>(p => p.Add(x => x.OnMove, e => moved = e));
        await cut.Find("pk-kanban").TriggerEventAsync("onpk-move", new PkMoveEventArgs { Item = "c1", From = "todo", To = "done", FromIndex = 0, ToIndex = 2 });
        Assert.Equal("c1", moved!.Item); Assert.Equal("todo", moved.From); Assert.Equal("done", moved.To);
        Assert.Equal(0, moved.FromIndex); Assert.Equal(2, moved.ToIndex);
    }
}
