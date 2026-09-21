using Bunit;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkDropzone with Blazor's InputFile in the input slot (issue #83): the InputFile is a light-DOM child with slot="input", so the element (which
// puts dropped files into that input and raises change) and Blazor's own file reading meet in one real <input type="file">.
public sealed class DropzoneInputFileTests : TestContext
{
    public DropzoneInputFileTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void The_InputFile_renders_as_a_direct_child_of_pk_dropzone_in_the_input_slot()
    {
        var cut = RenderComponent<DropzoneInputHost>();
        var input = cut.Find("pk-dropzone > input[type=file]");
        Assert.Equal("input", input.GetAttribute("slot"));
        Assert.NotNull(input.GetAttribute("multiple"));
    }

    [Fact]
    public async Task OnChange_of_the_slotted_InputFile_reads_the_file_content_through_IBrowserFile()
    {
        var cut = RenderComponent<DropzoneInputHost>();
        var input = cut.FindComponent<InputFile>();
        await cut.InvokeAsync(() => input.UploadFiles(InputFileContent.CreateFromText("hello", "a.txt")));
        Assert.Equal(new[] { "a.txt:hello" }, cut.Instance.Read);
    }
}
