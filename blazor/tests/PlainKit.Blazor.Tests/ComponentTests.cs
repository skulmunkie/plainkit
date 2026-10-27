using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

public sealed class ComponentTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public ComponentTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit(o => o.DevTools = true);
    }

    [Fact]
    public void LoadingOverlay_passes_Delay_and_MinTime_to_the_element_which_owns_the_busy_timing()
    {
        var el = Render<PkLoadingOverlay>(p => p.Add(x => x.Busy, true).Add(x => x.Delay, 150).Add(x => x.MinTime, 300)).Find("pk-loading-overlay");
        Assert.Equal(("150", "300"), (el.GetAttribute("delay"), el.GetAttribute("min-time")));
    }

    [Fact]
    public void Gallery_renders_the_pk_gallery_element_with_only_the_attributes_that_were_set()
    {
        var cut = Render<PkGallery>(p => p.Add(x => x.Kind, PkGalleryKind.Controls).Add(x => x.Theme, PkTheme.Light).Add(x => x.Height, 500));
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
        Assert.Null(Render<PkGallery>().Find("pk-gallery").GetAttribute("sections"));

        var sections = new[] { new PkGallerySection { Tag = "pk-button", Title = "Blazor", Open = true, Lines = ["Component PkButton"], Rows = [["Variant", "string"]] } };
        var json = Render<PkGallery>(p => p.Add(x => x.Sections, sections)).Find("pk-gallery").GetAttribute("sections");

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
    public void Button_overflow_reaches_the_element_as_an_attribute()
    {
        Assert.Equal("truncate", Render<PkButton>(p => p.Add(x => x.Overflow, ButtonOverflow.Truncate)).Find("pk-button").GetAttribute("overflow"));
        Assert.Null(Render<PkButton>().Find("pk-button").GetAttribute("overflow"));
    }

    [Fact]
    public void Button_bookmarklet_is_an_explicit_opt_in_that_reaches_the_element()
    {
        Assert.True(Render<PkButton>(p => p.Add(x => x.Bookmarklet, true)).Find("pk-button").HasAttribute("bookmarklet"));
        Assert.False(Render<PkButton>().Find("pk-button").HasAttribute("bookmarklet"));
    }

    [Fact]
    public void Dev_tools_page_hands_its_route_to_the_workspace_component_and_navigates_when_a_tab_is_chosen()
    {
        var cut = Render<PkDevToolsWorkspace>(p => p.Add(x => x.Tab, "scorecard"));
        var workspace = cut;

        Assert.Equal("scorecard", workspace.Instance.Tab);
        cut.InvokeAsync(() => workspace.Instance.SetWorkspace("files"));
        Assert.EndsWith("/_plainkit/files", Services.GetRequiredService<Microsoft.AspNetCore.Components.NavigationManager>().Uri);
    }

    [Fact]
    public void Dev_tools_page_says_it_is_off_when_disabled()
    {
        var ctx = new BunitContext();
        ctx.JSInterop.Mode = JSRuntimeMode.Loose;
        ctx.Services.AddPlainKit(o => o.DevTools = false);
        var cut = ctx.Render<PkDevToolsWorkspace>();

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
