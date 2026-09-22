using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkDialog.Size (the element's size) and MaxWidthPx (its max-width). Generated from blazor/mappings/dialog.json.
public sealed class DialogSizeTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public DialogSizeTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Theory]
    [InlineData(PkDialogSize.Sm, "sm")]
    [InlineData(PkDialogSize.Md, "md")]
    [InlineData(PkDialogSize.Lg, "lg")]
    [InlineData(PkDialogSize.Xl, "xl")]
    [InlineData(PkDialogSize.Fullscreen, "fullscreen")]
    public void Size_is_sent_as_the_size_attribute(PkDialogSize size, string attribute)
    {
        var cut = Render<PkDialog>(p => p.Add(x => x.Size, size));

        Assert.Equal(attribute, cut.Find("pk-dialog").GetAttribute("size"));
    }

    [Fact]
    public void A_dialog_without_a_Size_leaves_the_attribute_off_so_the_element_default_applies()
    {
        var cut = Render<PkDialog>();

        Assert.Null(cut.Find("pk-dialog").GetAttribute("size"));
    }

    [Fact]
    public void MaxWidthPx_is_sent_as_max_width()
    {
        var cut = Render<PkDialog>(p => p.Add(x => x.MaxWidthPx, 720));

        Assert.Equal("720", cut.Find("pk-dialog").GetAttribute("max-width"));
    }
}
