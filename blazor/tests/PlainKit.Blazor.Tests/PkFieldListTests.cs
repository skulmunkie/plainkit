using Bunit;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 527: PkFieldList sends Items as a typed JSON attribute (PkFieldListItem: Label, Value, Hidden?, Href?), like
// PkAppBarSearch's Items, alongside the existing ChildContent dt/dd form.
public sealed class PkFieldListTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkFieldListTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Items_reaches_the_element_as_a_JSON_attribute()
    {
        var items = new[] { new PkFieldListItem { Label = "SKU", Value = "AC-001" } };
        var cut = Render<PkFieldList>(p => p.Add(x => x.Items, items));
        var attr = cut.Find("pk-field-list").GetAttribute("items");
        Assert.Contains("\"label\":\"SKU\"", attr);
        Assert.Contains("\"value\":\"AC-001\"", attr);
    }

    [Fact]
    public void ShowEmpty_reaches_the_element_as_the_show_empty_attribute()
    {
        var cut = Render<PkFieldList>(p => p.Add(x => x.ShowEmpty, true));
        Assert.NotNull(cut.Find("pk-field-list").GetAttribute("show-empty"));
    }

    [Fact]
    public void ChildContent_still_renders_dt_and_dd_unchanged()
    {
        var cut = Render<PkFieldList>(p => p.Add(x => x.ChildContent, b =>
        {
            b.OpenElement(0, "dt"); b.AddContent(1, "Vendor"); b.CloseElement();
            b.OpenElement(2, "dd"); b.AddContent(3, "Acme Supply"); b.CloseElement();
        }));
        Assert.Equal("Vendor", cut.Find("dt").TextContent);
        Assert.Equal("Acme Supply", cut.Find("dd").TextContent);
    }
}
