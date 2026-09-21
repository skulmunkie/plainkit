using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Sections;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkPageHeader (hand-written, blazor/mappings/page-header.json): the title and a pk-breadcrumb built from PkCrumb records.
public sealed class PageHeaderTests : TestContext
{
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
    public void The_crumbs_become_a_breadcrumb_in_the_breadcrumb_slot_and_the_last_one_is_the_current_page()
    {
        var cut = RenderComponent<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail));
        var nav = cut.Find("pk-breadcrumb");

        Assert.Equal("breadcrumb", nav.GetAttribute("slot"));
        Assert.Equal("Breadcrumb", nav.GetAttribute("label"));
        var items = nav.Children;
        Assert.Equal(3, items.Length);
        Assert.Equal("A", items[0].TagName);
        Assert.Equal("/stock", items[0].GetAttribute("href"));
        Assert.Equal("Purchase orders", items[1].TextContent);
        Assert.Null(items[0].GetAttribute("aria-current"));
        Assert.Null(items[1].GetAttribute("aria-current"));
        Assert.Equal("SPAN", items[2].TagName);
        Assert.Equal("page", items[2].GetAttribute("aria-current"));
    }

    [Fact]
    public void A_last_crumb_with_an_address_is_a_link_that_is_still_the_current_page()
    {
        var cut = RenderComponent<PkPageHeader>(p => p.Add(x => x.Crumbs, new[] { new PkCrumb("Home", "/"), new PkCrumb("Orders", "/orders") }));
        var last = cut.Find("pk-breadcrumb").Children[1];

        Assert.Equal("A", last.TagName);
        Assert.Equal("/orders", last.GetAttribute("href"));
        Assert.Equal("page", last.GetAttribute("aria-current"));
    }

    [Fact]
    public void The_title_is_the_last_crumb_unless_a_Title_overrides_it()
    {
        Assert.Equal("PO 1042", RenderComponent<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail)).Find("pk-page-header").GetAttribute("heading"));

        var named = RenderComponent<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail).Add(x => x.Title, "Acme Supply order"));
        Assert.Equal("Acme Supply order", named.Find("pk-page-header").GetAttribute("heading"));
        Assert.Equal("PO 1042", named.Find("pk-breadcrumb").Children[2].TextContent);
    }

    [Fact]
    public void Without_crumbs_there_is_no_breadcrumb_and_the_level_starts_at_one()
    {
        var cut = RenderComponent<PkPageHeader>(p => p.Add(x => x.Title, "Settings"));

        Assert.Empty(cut.FindAll("pk-breadcrumb"));
        Assert.Equal("Settings", cut.Find("pk-page-header").GetAttribute("heading"));
        Assert.Equal("1", cut.Find("pk-page-header").GetAttribute("level"));
    }

    [Fact]
    public void The_suffix_actions_and_meta_go_in_their_slots()
    {
        var cut = RenderComponent<PkPageHeader>(p => p
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
        var custom = RenderComponent<PkPageHeader>(p => p.Add(x => x.BreadcrumbContent, "<a href=\"/x\">X</a>"));
        Assert.NotNull(custom.Find("span[slot=breadcrumb] a"));

        var both = RenderComponent<PkPageHeader>(p => p.Add(x => x.Crumbs, Trail).Add(x => x.BreadcrumbContent, "<a href=\"/x\">X</a>"));
        Assert.Empty(both.FindAll("span[slot=breadcrumb]"));
    }

    [Fact]
    public void Extra_attributes_pass_through_to_the_element()
    {
        var cut = RenderComponent<PkPageHeader>(p => p.Add(x => x.Title, "T").AddUnmatched("id", "hdr").AddUnmatched("class", "mine"));

        Assert.Equal("hdr", cut.Find("pk-page-header").Id);
        Assert.Equal("mine", cut.Find("pk-page-header").GetAttribute("class"));
    }

    [Fact]
    public void With_a_ShellSection_the_title_goes_into_the_shell_title_slot_and_is_not_drawn_twice()
    {
        var cut = Render(builder =>
        {
            builder.OpenComponent<SectionOutlet>(0);
            builder.AddAttribute(1, nameof(SectionOutlet.SectionName), "shell-title");
            builder.CloseComponent();
            builder.OpenComponent<PkPageHeader>(2);
            builder.AddAttribute(3, nameof(PkPageHeader.ShellSection), "shell-title");
            builder.AddAttribute(4, nameof(PkPageHeader.Crumbs), (IReadOnlyList<PkCrumb>)Trail);
            builder.AddAttribute(5, nameof(PkPageHeader.Title), "Acme Supply order");
            builder.CloseComponent();
        });

        var slotted = cut.Nodes.OfType<AngleSharp.Dom.IText>().Single(n => n.Data.Trim().Length > 0);
        Assert.Equal("Acme Supply order", slotted.Data.Trim());
        Assert.Null(cut.Find("pk-page-header").GetAttribute("heading"));
        Assert.Equal(3, cut.Find("pk-breadcrumb").Children.Length);
    }
}
