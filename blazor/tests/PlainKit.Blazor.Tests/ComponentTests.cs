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
    public void Gallery_sends_its_sections_as_json_text_and_none_when_there_are_none()
    {
        Assert.Null(RenderComponent<PkGallery>().Find("pk-gallery").GetAttribute("sections"));

        var sections = new[] { new PkGallerySection { Tag = "pk-button", Title = "Blazor", Open = true, Lines = ["Component PkButton"], Rows = [["Variant", "string"]] } };
        var json = RenderComponent<PkGallery>(p => p.Add(x => x.Sections, sections)).Find("pk-gallery").GetAttribute("sections");

        using var doc = JsonDocument.Parse(json!);
        var first = doc.RootElement[0];
        Assert.Equal("pk-button", first.GetProperty("tag").GetString());
        Assert.Equal("Blazor", first.GetProperty("title").GetString());
        Assert.True(first.GetProperty("open").GetBoolean());
        Assert.False(first.TryGetProperty("code", out _));
    }

    [Fact]
    public void Blazor_section_is_computed_from_the_mappings_for_every_mapped_element()
    {
        var sections = PkGallerySection.ForBlazor();
        Assert.Equal(PkMappingInfo.Tags.Count, sections.Count);
        var button = Assert.Single(sections, s => s.Tag == "pk-button");
        Assert.Contains("PkButton", button.Lines![0]);
        Assert.Contains(button.Rows!, r => r[0] == "Variant");
        Assert.StartsWith("<PkButton", button.Code);
    }

    [Fact]
    public void Dev_tools_page_offers_the_three_workspaces_and_marks_the_current_one()
    {
        var cut = RenderComponent<PkDevToolsPage>(p => p.Add(x => x.Tab, "scorecard"));
        var tabs = cut.FindAll("pk-tab");

        Assert.Equal(["Gallery", "Files", "Scorecard"], tabs.Select(t => t.TextContent.Trim()));
        Assert.Equal("scorecard", cut.Find("pk-tabs").GetAttribute("value"));
        Assert.Single(cut.FindComponents<PkScorecard>());
    }

    [Fact]
    public void Dev_tools_page_mounts_the_dev_tools_dock_instead_of_its_own_tool_tabs()
    {
        var cut = RenderComponent<PkDevToolsPage>();
        var tools = Assert.Single(cut.FindComponents<PkDevTools>()).Instance;

        Assert.Equal(PkDevToolsMode.Dock, tools.Mode);
        Assert.True(tools.Open);
        Assert.True(tools.BlazorPanels);
        Assert.Empty(cut.FindComponents<PkPerformance>());
        Assert.Empty(cut.FindComponents<PkConsole>());
        Assert.Empty(cut.FindComponents<PkLogs>());
    }

    [Theory]
    [InlineData("console", "console", "gallery")]
    [InlineData("blazor", "blazor", "gallery")]
    [InlineData("scorecard", null, "scorecard")]
    [InlineData("nonsense", null, "gallery")]
    public void Dev_tools_page_opens_the_dock_on_a_tool_tab_and_keeps_workspaces_for_the_rest(string route, string? dockTab, string workspace)
    {
        var cut = RenderComponent<PkDevToolsPage>(p => p.Add(x => x.Tab, route));

        Assert.Equal(dockTab, cut.FindComponent<PkDevTools>().Instance.Tab);
        Assert.Equal(workspace, cut.Find("pk-tabs").GetAttribute("value"));
    }

    [Fact]
    public void Dev_tools_page_falls_back_to_the_gallery_for_an_unknown_tab()
    {
        var cut = RenderComponent<PkDevToolsPage>(p => p.Add(x => x.Tab, "nonsense"));

        Assert.Equal("gallery", cut.Find("pk-tabs").GetAttribute("value"));
        Assert.NotNull(cut.Find("pk-gallery"));
    }

    [Fact]
    public void Dev_tools_page_says_it_is_off_when_disabled()
    {
        var ctx = new TestContext();
        ctx.JSInterop.Mode = JSRuntimeMode.Loose;
        ctx.Services.AddPlainKit(o => o.DevTools = false);
        var cut = ctx.RenderComponent<PkDevToolsPage>();

        Assert.Empty(cut.FindAll("pk-tab"));
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
