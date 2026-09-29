using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 644 (PR2): PkToolDock wraps mountToolDock (core/modules/tool-dock/tool-dock.js), generalizing PkDevTools's single-hidden-host-div
// reveal trick to N panels. Each PkToolDockPanel registers itself with the enclosing PkToolDock through a CascadingValue (the same
// cascading-registration pattern PkDock's own children use); PkToolDock then hands JavaScript a client-built panels array of
// { id, title, host } so the bridge can append each panel's already-rendered host div and toggle its hidden attribute.
public sealed class PkToolDockTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkToolDockTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static RenderFragment TwoPanels() => builder =>
    {
        builder.OpenComponent<PkToolDockPanel>(0);
        builder.AddAttribute(1, "Id", "a");
        builder.AddAttribute(2, "Title", "Panel A");
        builder.AddAttribute(3, "ChildContent", (RenderFragment)(b => b.AddContent(0, "content a")));
        builder.CloseComponent();
        builder.OpenComponent<PkToolDockPanel>(4);
        builder.AddAttribute(5, "Id", "b");
        builder.AddAttribute(6, "Title", "Panel B");
        builder.AddAttribute(7, "ChildContent", (RenderFragment)(b => b.AddContent(0, "content b")));
        builder.CloseComponent();
    };

    [Fact]
    public void registers_every_panel_and_renders_its_content_into_a_hidden_host_div()
    {
        var cut = Render<PkToolDock>(p => p
            .Add(x => x.Label, "My tools")
            .Add(x => x.LauncherLabel, "Tools")
            .Add(x => x.ChildContent, TwoPanels()));

        var hosts = cut.FindAll("div[hidden]");
        Assert.Equal(3, hosts.Count); // the dock's own marker div plus each panel's host div
        Assert.Contains("content a", cut.Markup);
        Assert.Contains("content b", cut.Markup);
    }

    [Fact]
    public void mounts_with_a_panels_array_built_from_the_registered_panels()
    {
        var cut = Render<PkToolDock>(p => p
            .Add(x => x.Label, "My tools")
            .Add(x => x.LauncherLabel, "Tools")
            .Add(x => x.Mode, PkToolDockMode.Inline)
            .Add(x => x.ChildContent, TwoPanels()));

        var call = Assert.Single(_bridge.Invocations["mountToolDock"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);

        var optionsJson = System.Text.Json.JsonSerializer.Serialize(call.Arguments[1]);
        Assert.Contains("\"label\":\"My tools\"", optionsJson);
        Assert.Contains("\"launcherLabel\":\"Tools\"", optionsJson);
        Assert.Contains("\"mode\":\"inline\"", optionsJson);

        var panelHosts = (IEnumerable<object>)call.Arguments[2]!;
        var ids = panelHosts.Select(p => (string)p.GetType().GetProperty("id")!.GetValue(p)!).ToArray();
        Assert.Equal(new[] { "a", "b" }, ids);
        Assert.All(panelHosts, p => Assert.IsType<ElementReference>(p.GetType().GetProperty("host")!.GetValue(p)));
    }

    [Fact]
    public async Task unregistering_a_panel_removes_it_from_the_panels_array_on_the_next_mount()
    {
        var cut = Render<PkToolDock>(p => p
            .Add(x => x.Label, "My tools")
            .Add(x => x.LauncherLabel, "Tools")
            .Add(x => x.ChildContent, TwoPanels()));

        Assert.Single(_bridge.Invocations["mountToolDock"]);

await cut.InvokeAsync(() => cut.Render(p => p
            .Add(x => x.Hotkey, "")
            .Add(x => x.ChildContent, (RenderFragment)(builder =>
            {
                builder.OpenComponent<PkToolDockPanel>(0);
                builder.AddAttribute(1, "Id", "a");
                builder.AddAttribute(2, "Title", "Panel A");
                builder.CloseComponent();
            }))));

        Assert.Equal(2, _bridge.Invocations["mountToolDock"].Count);
        var panelHosts = (IEnumerable<object>)_bridge.Invocations["mountToolDock"].Last().Arguments[2]!;
        var ids = panelHosts.Select(p => (string)p.GetType().GetProperty("id")!.GetValue(p)!).ToArray();
        Assert.Equal(new[] { "a" }, ids);
    }

    [Fact]
    public async Task SelectAsync_drives_selectTool_instead_of_remounting()
    {
        var cut = Render<PkToolDock>(p => p
            .Add(x => x.Label, "My tools")
            .Add(x => x.LauncherLabel, "Tools")
            .Add(x => x.ChildContent, TwoPanels()));
        Assert.Single(_bridge.Invocations["mountToolDock"]);

        var tool = cut.Instance;
        await cut.InvokeAsync(() => tool.SelectAsync("b"));

        var call = Assert.Single(_bridge.Invocations["selectTool"]);
        Assert.Equal("b", call.Arguments[1]);
        Assert.Single(_bridge.Invocations["mountToolDock"]); // still just the one mount
    }

    [Fact]
    public async Task OpenAsync_and_CloseAsync_call_the_bridge()
    {
        var cut = Render<PkToolDock>(p => p
            .Add(x => x.Label, "My tools")
            .Add(x => x.LauncherLabel, "Tools")
            .Add(x => x.ChildContent, TwoPanels()));

        await cut.InvokeAsync(() => cut.Instance.OpenAsync());
        Assert.Single(_bridge.Invocations["openTools"]);

        await cut.InvokeAsync(() => cut.Instance.CloseAsync());
        Assert.Single(_bridge.Invocations["closeTools"]);
    }

    [Fact]
    public async Task DisposeAsync_destroys_the_dock()
    {
        var cut = Render<PkToolDock>(p => p
            .Add(x => x.Label, "My tools")
            .Add(x => x.LauncherLabel, "Tools")
            .Add(x => x.ChildContent, TwoPanels()));

        await DisposeComponentsAsync();

        Assert.Single(_bridge.Invocations["destroy"]);
    }

    [Fact]
    public void a_panel_rendered_outside_a_PkToolDock_throws()
    {
        Assert.Throws<InvalidOperationException>(() => Render<PkToolDockPanel>(p => p.Add(x => x.Id, "a").Add(x => x.Title, "A")));
    }
}
