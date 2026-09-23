using Bunit;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkImageGallery with Blazor's InputFile in the input slot (issue #201, same fix as #83 for PkDropzone): the InputFile is a light-DOM
// child with slot="input", so it becomes the add tile's own picker and Blazor's own file reading meets a real <input type="file">.
public sealed class ImageGalleryInputFileTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public ImageGalleryInputFileTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void The_InputFile_renders_inside_pk_image_gallery_s_input_slot_wrapper()
    {
        var cut = Render<ImageGalleryInputHost>();
        var wrapper = cut.Find("pk-image-gallery > [slot=input]");
        var input = wrapper.QuerySelector("input[type=file]");
        Assert.NotNull(input);
        Assert.NotNull(input!.GetAttribute("multiple"));
    }

    [Fact]
    public async Task OnChange_of_the_slotted_InputFile_reads_the_file_content_through_IBrowserFile()
    {
        var cut = Render<ImageGalleryInputHost>();
        var input = cut.FindComponent<InputFile>();
        await cut.InvokeAsync(() => input.UploadFiles(InputFileContent.CreateFromText("hello", "a.png")));
        Assert.Equal(new[] { "a.png:hello" }, cut.Instance.Read);
    }
}
