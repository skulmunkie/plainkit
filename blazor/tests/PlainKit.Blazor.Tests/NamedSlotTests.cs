using Bunit;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1384: the rich-content named slots the elements declare (alert action and icon, drawer header, form summary-title, form-section
// heading and description, field-list heading, page-shell title) are RenderFragment parameters filling the slot.
public sealed class NamedSlotTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public NamedSlotTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Alert_action_and_icon_fill_their_slots()
    {
        var cut = Render<PkAlert>(p => p.Add(x => x.ActionContent, "Undo").Add(x => x.IconContent, "!"));
        Assert.Equal("Undo", cut.Find("pk-alert span[slot=action]").TextContent);
        Assert.Equal("!", cut.Find("pk-alert span[slot=icon]").TextContent);
    }

    [Fact]
    public void Drawer_header_fills_its_slot()
        => Assert.Equal("Head", Render<PkDrawer>(p => p.Add(x => x.HeaderContent, "Head")).Find("pk-drawer span[slot=header]").TextContent);

    [Fact]
    public void Form_summary_title_fills_its_slot()
        => Assert.Equal("Fix these", Render<PkForm>(p => p.Add(x => x.SummaryTitleContent, "Fix these")).Find("pk-form span[slot=summary-title]").TextContent);

    [Fact]
    public void FormSection_heading_and_description_fill_their_slots()
    {
        var cut = Render<PkFormSection>(p => p.Add(x => x.HeadingContent, "H").Add(x => x.DescriptionContent, "D"));
        Assert.Equal("H", cut.Find("pk-form-section span[slot=heading]").TextContent);
        Assert.Equal("D", cut.Find("pk-form-section span[slot=description]").TextContent);
    }

    [Fact]
    public void FieldList_heading_fills_its_slot()
        => Assert.Equal("H", Render<PkFieldList>(p => p.Add(x => x.HeadingContent, "H")).Find("pk-field-list span[slot=heading]").TextContent);

    [Fact]
    public void PageShell_title_fills_its_slot()
        => Assert.Equal("T", Render<PkPageShell>(p => p.Add(x => x.TitleContent, "T")).Find("pk-page-shell span[slot=title]").TextContent);
}
