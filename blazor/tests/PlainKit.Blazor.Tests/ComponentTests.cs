using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

public sealed class ComponentTests : TestContext
{
    public ComponentTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit(o => o.DevTools = true);
    }

    [Fact]
    public void Gallery_renders_the_pk_gallery_element_with_only_the_attributes_that_were_set()
    {
        var cut = RenderComponent<PkGallery>(p => p.Add(x => x.Kind, PkGalleryKind.Controls).Add(x => x.Theme, PkTheme.Light).Add(x => x.Height, 500));
        var el = cut.Find("pk-gallery");

        Assert.Equal("controls", el.GetAttribute("kind"));
        Assert.Equal("light", el.GetAttribute("theme"));
        Assert.Equal("500", el.GetAttribute("height"));
        Assert.Null(el.GetAttribute("width"));
        Assert.Null(el.GetAttribute("chrome"));
        Assert.Equal(PkAssets.GalleryEmbed, el.GetAttribute("src"));
    }

    [Fact]
    public void Dev_tools_page_offers_the_five_tabs_and_marks_the_current_one()
    {
        var cut = RenderComponent<PkDevToolsPage>(p => p.Add(x => x.Tab, "console"));
        var tabs = cut.FindAll("[role=tab]");

        Assert.Equal(["Gallery", "Files", "Scorecard", "Performance", "Console"], tabs.Select(t => t.TextContent.Trim()));
        Assert.Equal("Console", cut.Find("[role=tab].active").TextContent.Trim());
    }

    [Fact]
    public void Dev_tools_page_falls_back_to_the_gallery_for_an_unknown_tab()
    {
        var cut = RenderComponent<PkDevToolsPage>(p => p.Add(x => x.Tab, "nonsense"));

        Assert.Equal("Gallery", cut.Find("[role=tab].active").TextContent.Trim());
        Assert.NotNull(cut.Find("pk-gallery"));
    }

    [Fact]
    public void Dev_tools_page_says_it_is_off_when_disabled()
    {
        var ctx = new TestContext();
        ctx.JSInterop.Mode = JSRuntimeMode.Loose;
        ctx.Services.AddPlainKit(o => o.DevTools = false);
        var cut = ctx.RenderComponent<PkDevToolsPage>();

        Assert.Empty(cut.FindAll("[role=tab]"));
        Assert.Contains("Dev tools are off", cut.Markup);
    }

    [Fact]
    public void Score_targets_serialize_without_the_fields_they_do_not_use()
    {
        Assert.Equal("""{"name":"Home","url":"/"}""", JsonSerializer.Serialize(PkScoreTarget.Page("/", "Home")));
        using var markup = JsonDocument.Parse(JsonSerializer.Serialize(PkScoreTarget.Markup("Card", "<div></div>")));
        Assert.Equal("<div></div>", markup.RootElement.GetProperty("html").GetString());
        Assert.False(markup.RootElement.TryGetProperty("url", out _));
    }

    [Theory]
    [InlineData(PkTheme.Auto, null)]
    [InlineData(PkTheme.Dark, "dark")]
    [InlineData(PkTheme.Light, "light")]
    public void Enum_attributes_are_lower_case_and_the_first_member_means_leave_it_to_the_toolkit(PkTheme theme, string? expected) =>
        Assert.Equal(expected, theme.Attr());
}
