using Bunit;
using Microsoft.AspNetCore.Components;
using Xunit;

namespace PlainKit.Blazor.Tests;

// The pk-splitter collapse/persist parameters and the pk-code-view header parameters (issue #1523): the generated wrappers
// forward them as attributes, @bind-Collapsed follows pk-collapse-change, and the header fragments land in their slots.
public sealed class SplitterCodeViewTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public SplitterCodeViewTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void A_splitter_forwards_collapsible_persist_key_and_toggle_label_as_attributes()
    {
        var cut = Render<PkSplitter>(p => p
            .Add(x => x.Collapsible, true)
            .Add(x => x.PersistKey, "inspector")
            .Add(x => x.ToggleLabel, "Detail panel"));
        var el = cut.Find("pk-splitter");
        Assert.NotNull(el.GetAttribute("collapsible"));
        Assert.Equal("inspector", el.GetAttribute("persist-key"));
        Assert.Equal("Detail panel", el.GetAttribute("toggle-label"));
        Assert.Null(el.GetAttribute("collapsed"));
    }

    [Fact]
    public async Task A_splitter_bound_with_bind_collapsed_follows_pk_collapse_change()
    {
        var collapsed = false;
        var cut = Render<PkSplitter>(p => p
            .Add(x => x.Collapsible, true)
            .Bind(x => x.Collapsed, collapsed, v => collapsed = v));
        Assert.Null(cut.Find("pk-splitter").GetAttribute("collapsed"));

        await cut.Find("pk-splitter").TriggerEventAsync("onpk-collapse-change", new PkCollapseChangeEventArgs { Collapsed = true });
        Assert.True(collapsed);
        Assert.NotNull(cut.Find("pk-splitter").GetAttribute("collapsed"));

        await cut.Find("pk-splitter").TriggerEventAsync("onpk-collapse-change", new PkCollapseChangeEventArgs { Collapsed = false });
        Assert.False(collapsed);
        Assert.Null(cut.Find("pk-splitter").GetAttribute("collapsed"));
    }

    [Fact]
    public void A_code_view_forwards_header_language_fill_and_copy()
    {
        var cut = Render<PkCodeView>(p => p
            .Add(x => x.Header, true)
            .Add(x => x.Language, "js")
            .Add(x => x.Fill, true)
            .Add(x => x.Copy, true)
            .Add(x => x.Label, "order.js"));
        var el = cut.Find("pk-code-view");
        Assert.NotNull(el.GetAttribute("header"));
        Assert.NotNull(el.GetAttribute("fill"));
        Assert.NotNull(el.GetAttribute("copy"));
        Assert.Equal("js", el.GetAttribute("language"));
        Assert.Equal("order.js", el.GetAttribute("label"));
    }

    [Fact]
    public void A_code_view_places_its_header_start_and_actions_fragments_in_named_slots()
    {
        var cut = Render<PkCodeView>(p => p
            .Add(x => x.Header, true)
            .Add(x => x.HeaderStart, (RenderFragment)(b => b.AddMarkupContent(0, "<span>beta</span>")))
            .Add(x => x.Actions, (RenderFragment)(b => b.AddMarkupContent(0, "<button>Outline</button>"))));
        Assert.Equal("beta", cut.Find("pk-code-view [slot=header-start]").TextContent);
        Assert.Equal("Outline", cut.Find("pk-code-view [slot=actions]").TextContent);
    }

    [Fact]
    public async Task A_code_view_reports_pk_copy_through_on_copy()
    {
        bool? ok = null;
        var cut = Render<PkCodeView>(p => p
            .Add(x => x.Copy, true)
            .Add(x => x.OnCopy, EventCallback.Factory.Create<PkCopyEventArgs>(this, e => ok = e.Ok)));
        await cut.Find("pk-code-view").TriggerEventAsync("onpk-copy", new PkCopyEventArgs { Ok = true });
        Assert.True(ok);
    }
}
