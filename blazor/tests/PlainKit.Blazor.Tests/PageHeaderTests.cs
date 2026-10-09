using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkPageHeader (generated from blazor/mappings/page-header.json: slotted option and json: true): the slotted title and the typed PkCrumb list as the element's crumbs attribute (the trail itself is the element's).
public sealed class PageHeaderTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private static readonly PkCrumb[] Trail =
    [
        new("Stock", "/stock"),
        new("Purchase orders", "/stock/orders"),
        new("PO 1042"),
    ];

    public PageHeaderTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void The_crumbs_go_down_as_one_JSON_attribute_and_the_element_draws_the_trail()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail).Add(x => x.BreadcrumbLabel, "Trail"));
        var el = cut.Find("pk-page-header");

        Assert.Equal("[{\"label\":\"Stock\",\"href\":\"/stock\"},{\"label\":\"Purchase orders\",\"href\":\"/stock/orders\"},{\"label\":\"PO 1042\",\"href\":null}]", el.GetAttribute("crumbs"));
        Assert.Equal("Trail", el.GetAttribute("breadcrumb-label"));
        Assert.Empty(cut.FindAll("pk-breadcrumb"));
    }

    [Fact]
    public void An_explicit_Title_is_also_a_slotted_pk_heading_at_the_Level_and_focusable()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Title, "Orders"));
        var h = cut.Find("pk-page-header > pk-heading");

        Assert.Equal("title", h.GetAttribute("slot"));
        Assert.Equal("1", h.GetAttribute("level"));
        Assert.Equal("-1", h.GetAttribute("tabindex"));
        Assert.Equal("Orders", h.TextContent);
        Assert.Empty(Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail)).FindAll("pk-heading"));
    }

    [Fact]
    public void Without_a_Title_the_heading_attribute_stays_unset_and_no_heading_is_slotted()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail));

        Assert.Null(cut.Find("pk-page-header").GetAttribute("heading"));
        Assert.Empty(cut.FindAll("pk-heading"));
    }

    [Fact]
    public void Without_crumbs_there_is_no_breadcrumb_and_the_level_starts_at_one()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Title, "Settings"));

        Assert.Null(cut.Find("pk-page-header").GetAttribute("crumbs"));
        Assert.Equal("Settings", cut.Find("pk-page-header").GetAttribute("heading"));
        Assert.Equal("1", cut.Find("pk-page-header").GetAttribute("level"));
    }

    [Fact]
    public void The_suffix_actions_and_meta_go_in_their_slots()
    {
        var cut = Render<PkPageHeader>(p => p
            .Add(x => x.Title, "Orders")
            .Add(x => x.SuffixContent, "<pk-badge>Open</pk-badge>")
            .Add(x => x.ActionsContent, "<pk-button>Receive</pk-button>")
            .Add(x => x.MetaContent, "Updated today"));
        var el = cut.Find("pk-page-header");

        Assert.NotNull(el.QuerySelector(":scope > pk-badge"));
        Assert.Equal("Receive", el.QuerySelector("span[slot=actions] pk-button")!.TextContent);
        Assert.Equal("Updated today", el.QuerySelector("span[slot=meta]")!.TextContent);
    }

    [Fact]
    public void A_custom_trail_is_used_only_when_no_crumbs_are_given()
    {
        var custom = Render<PkPageHeader>(p => p.Add(x => x.BreadcrumbContent, "<a href=\"/x\">X</a>"));
        Assert.NotNull(custom.Find("span[slot=breadcrumb] a"));

        var both = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail).Add(x => x.BreadcrumbContent, "<a href=\"/x\">X</a>"));
        Assert.Empty(both.FindAll("span[slot=breadcrumb]"));
    }

    [Fact]
    public void Extra_attributes_pass_through_to_the_element()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Title, "T").AddUnmatched("id", "hdr").AddUnmatched("class", "mine"));

        Assert.Equal("hdr", cut.Find("pk-page-header").Id);
        Assert.Equal("mine", cut.Find("pk-page-header").GetAttribute("class"));
    }

    [Fact]
    public void BackLink_and_the_home_crumb_are_attributes_of_the_element()
    {
        var plain = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail)).Find("pk-page-header");
        Assert.False(plain.HasAttribute("back-link"));
        Assert.False(plain.HasAttribute("home-href"));

        var cut = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail).Add(x => x.BackLink, true).Add(x => x.HomeHref, "/").Add(x => x.HomeLabel, "Dashboard").Add(x => x.HomeIcon, "home")).Find("pk-page-header");
        Assert.True(cut.HasAttribute("back-link"));
        Assert.Equal("/", cut.GetAttribute("home-href"));
        Assert.Equal("Dashboard", cut.GetAttribute("home-label"));
        Assert.Equal("home", cut.GetAttribute("home-icon"));
    }

    [Fact]
    public void Spacious_is_off_by_default_and_reflects_when_set()
    {
        var plain = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail));
        Assert.False(plain.Find("pk-page-header").HasAttribute("spacious"));

        var cut = Render<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail).Add(x => x.Spacious, true));
        Assert.True(cut.Find("pk-page-header").HasAttribute("spacious"));
    }

    [Fact]
    public void TabsContent_renders_in_the_tabs_slot_through_a_transparent_wrapper()
    {
        var cut = Render<PkPageHeader>(p => p.Add(x => x.Title, "Record").Add(x => x.TabsContent, "<pk-tabs></pk-tabs>"));
        var wrap = cut.Find("span[slot=tabs]");
        Assert.Contains("u-contents", wrap.ClassName);
        Assert.NotNull(wrap.QuerySelector("pk-tabs"));
    }
}
