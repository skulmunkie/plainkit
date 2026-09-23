using Bunit;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 207: an optional term/value row for PkFieldList that hides itself when there is nothing to show.
public sealed class PkFieldListRowTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkFieldListRowTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void A_plain_Value_renders_its_dt_and_dd()
    {
        var cut = Render<PkFieldListRow>(p => p.Add(x => x.Label, "Number").Add(x => x.Value, "AC-001"));

        Assert.Equal("Number", cut.Find("dt").TextContent);
        Assert.Equal("AC-001", cut.Find("dd").TextContent);
    }

    [Fact]
    public void ChildContent_renders_in_the_dd()
    {
        var cut = Render<PkFieldListRow>(p => p
            .Add(x => x.Label, "Status")
            .Add(x => x.ChildContent, b => b.AddContent(0, "Open")));

        Assert.Equal("Status", cut.Find("dt").TextContent);
        Assert.Equal("Open", cut.Find("dd").TextContent);
    }

    [Fact]
    public void No_value_and_no_child_content_with_default_SkipEmpty_renders_nothing()
    {
        var cut = Render<PkFieldListRow>(p => p.Add(x => x.Label, "Note"));

        Assert.Empty(cut.FindAll("dt"));
        Assert.Empty(cut.FindAll("dd"));
    }

    [Fact]
    public void No_value_and_no_child_content_with_SkipEmpty_false_still_renders_empty()
    {
        var cut = Render<PkFieldListRow>(p => p.Add(x => x.Label, "Note").Add(x => x.SkipEmpty, false));

        Assert.Equal("Note", cut.Find("dt").TextContent);
        Assert.Equal("", cut.Find("dd").TextContent);
    }

    [Fact]
    public void When_true_forces_render_even_with_no_value_overriding_SkipEmpty()
    {
        var cut = Render<PkFieldListRow>(p => p.Add(x => x.Label, "Note").Add(x => x.When, true));

        Assert.Equal("Note", cut.Find("dt").TextContent);
        Assert.Equal("", cut.Find("dd").TextContent);
    }

    [Fact]
    public void When_false_forces_hide_even_with_a_value_present()
    {
        var cut = Render<PkFieldListRow>(p => p.Add(x => x.Label, "Number").Add(x => x.Value, "AC-001").Add(x => x.When, false));

        Assert.Empty(cut.FindAll("dt"));
        Assert.Empty(cut.FindAll("dd"));
    }
}
