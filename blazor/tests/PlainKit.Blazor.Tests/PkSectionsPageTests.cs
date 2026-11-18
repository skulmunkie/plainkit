using Bunit;
using Microsoft.JSInterop;
using Microsoft.AspNetCore.Components;
using PlainKit.Blazor;
using Xunit;

namespace PlainKit.Blazor.Tests;

// The generated PkSectionsPage (#2010): slot maps and events. The path through the real JS-interop dispatcher is the lab case sections-page-slots-actions-tabs.
public sealed class PkSectionsPageTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkSectionsPageTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static RenderFragment Html(string html) => b => b.AddMarkupContent(0, html);

    [Fact]
    public void SectionContent_and_SideContent_become_slotted_children_by_section_id()
    {
        var cut = Render<PkSectionsPage>(p => p
            .Add(x => x.Config, new { sections = new[] { new { id = "a", label = "A" } } })
            .Add(x => x.Section, "a")
            .Add(x => x.SectionContent, new Dictionary<string, RenderFragment> { ["a"] = Html("<p>Main A</p>") })
            .Add(x => x.SideContent, new Dictionary<string, RenderFragment> { ["a"] = Html("<p>Side A</p>") })
            .Add(x => x.BadgesContent, Html("<b>New</b>")));
        var el = cut.Find("pk-sections-page");
        Assert.Equal("a", el.GetAttribute("section"));
        Assert.Contains("\"sections\"", el.GetAttribute("config"));
        Assert.Equal("Main A", cut.Find("[slot=section-a]").TextContent);
        Assert.Equal("Side A", cut.Find("[slot=side-a]").TextContent);
        Assert.Equal("New", cut.Find("[slot=badges]").TextContent);
    }

    [Fact]
    public void A_section_without_side_content_has_no_side_slot()
    {
        var cut = Render<PkSectionsPage>(p => p.Add(x => x.SectionContent, new Dictionary<string, RenderFragment> { ["a"] = Html("x") }));
        Assert.Empty(cut.FindAll("[slot^=side-]"));
    }

    [Fact]
    public async Task OnAction_and_OnSectionChange_receive_the_element_events()
    {
        string? action = null; PkSectionChangeEventArgs? change = null;
        var cut = Render<PkSectionsPage>(p => p
            .Add(x => x.OnAction, EventCallback.Factory.Create<PkActionEventArgs>(this, e => action = e.Key))
            .Add(x => x.OnSectionChange, EventCallback.Factory.Create<PkSectionChangeEventArgs>(this, e => change = e)));
        var el = cut.Find("pk-sections-page");
        await el.TriggerEventAsync("onpk-action", new PkActionEventArgs { Key = "archive" });
        await el.TriggerEventAsync("onpk-section-change", new PkSectionChangeEventArgs { Section = "b", Previous = "a" });
        Assert.Equal("archive", action);
        Assert.Equal("b", change!.Section);
        Assert.Equal("a", change.Previous);
    }
}
