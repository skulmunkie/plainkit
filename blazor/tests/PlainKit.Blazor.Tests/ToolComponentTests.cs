using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

/// <summary>
/// The tool components (scorecard, performance, console, logs, log settings, quality, theme editor, dev tools) talk to the bridge module
/// <c>plainkit.blazor.js</c>: what they call, with which options, when they mount again, and that they let go of the JavaScript side when disposed.
/// </summary>
public sealed class ToolComponentTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public ToolComponentTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit(o => o.DevTools = true);
    }

    private static JsonElement Options(JSRuntimeInvocation call, int index = 1) => JsonSerializer.SerializeToElement(call.Arguments[index]);

    private int Calls(string identifier) => _bridge.Invocations.Count(i => i.Identifier == identifier);

    // ---- every tool: mount once with its options, again only when they change, destroy on dispose, tolerate a gone circuit

    [Fact]
    public void Quality_mounts_with_its_options_into_an_empty_container()
    {
        var cut = Render<PkQuality>(p => p.Add(x => x.Phone, true).Add(x => x.AutoRun, true).Add(x => x.Theme, PkTheme.Light).Add(x => x.Height, "20rem"));

        var call = Assert.Single(_bridge.Invocations["mountQuality"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
        var options = Options(call);
        Assert.True(options.GetProperty("phone").GetBoolean());
        Assert.True(options.GetProperty("autorun").GetBoolean());
        Assert.Equal("light", options.GetProperty("theme").GetString());
        Assert.Equal("20rem", options.GetProperty("height").GetString());
        Assert.Empty(cut.Find("div").ChildNodes); // JavaScript owns the subtree: Blazor renders no children in it
    }

    [Fact]
    public void Quality_leaves_phone_and_theme_unset_by_default()
    {
        Render<PkQuality>();

        var options = Options(Assert.Single(_bridge.Invocations["mountQuality"]));
        Assert.Equal(JsonValueKind.Null, options.GetProperty("phone").ValueKind);
        Assert.Equal(JsonValueKind.Null, options.GetProperty("theme").ValueKind);
    }

    [Fact]
    public async Task Quality_runs_the_checks_through_the_bridge()
    {
        var cut = Render<PkQuality>();

        await cut.InvokeAsync(() => cut.Instance.RunAsync());

        Assert.Equal(1, Calls("run"));
    }

    [Fact]
    public void Quality_mounts_again_only_when_a_parameter_changed()
    {
        var cut = Render<PkQuality>(p => p.Add(x => x.Height, "10rem"));

        cut.Render(p => p.Add(x => x.Height, "10rem"));
        Assert.Equal(1, Calls("mountQuality"));

        cut.Render(p => p.Add(x => x.Height, "12rem"));
        Assert.Equal(2, Calls("mountQuality"));
    }

    [Fact]
    public async Task Quality_destroys_the_javascript_side_when_disposed()
    {
        Render<PkQuality>();

        await DisposeComponentsAsync();

        Assert.Equal(1, Calls("destroy"));
    }

    [Fact]
    public async Task Disposing_after_the_circuit_is_gone_does_not_throw()
    {
        _bridge.SetupVoid("destroy", _ => true).SetException(new JSDisconnectedException("gone"));
        Render<PkQuality>();

        var error = await Record.ExceptionAsync(DisposeComponentsAsync);

        Assert.Null(error);
    }

    [Fact]
    public void Theme_editor_mounts_with_its_options()
    {
        var cut = Render<PkThemeEditor>(p => p.Add(x => x.StorageKey, "my-theme").Add(x => x.Preview, false).Add(x => x.Theme, PkTheme.Dark).Add(x => x.Height, "30rem"));

        var options = Options(Assert.Single(_bridge.Invocations["mountThemeEditor"]));
        Assert.Equal("my-theme", options.GetProperty("storageKey").GetString());
        Assert.False(options.GetProperty("preview").GetBoolean());
        Assert.Equal("dark", options.GetProperty("theme").GetString());
        Assert.Equal("30rem", options.GetProperty("height").GetString());
        Assert.Empty(cut.Find("div").ChildNodes);
    }

    [Fact]
    public void Theme_editor_passes_the_initial_theme_and_the_presets_as_text()
    {
        var css = ":root, [data-theme=\"dark\"] { --color-accent: #123456; }";
        var presets = new[] { new PkThemePreset("Brand", css, "Our colours"), new PkThemePreset("Plain", "{\"shared\":{}}") };
        Render<PkThemeEditor>(p => p.Add(x => x.InitialTheme, css).Add(x => x.Presets, presets));

        var call = Assert.Single(_bridge.Invocations["mountThemeEditor"]);
        var options = Options(call);
        Assert.Equal(css, options.GetProperty("initial").GetString());
        var sent = options.GetProperty("presets").EnumerateArray().ToArray();
        Assert.Equal(new[] { "Brand", "Plain" }, sent.Select(x => x.GetProperty("name").GetString()));
        Assert.Equal(css, sent[0].GetProperty("theme").GetString());
        Assert.Equal("Our colours", sent[0].GetProperty("description").GetString());
        Assert.Null(call.Arguments[2]); // no handler: nothing is called back
    }

    [Fact]
    public void Theme_editor_leaves_the_initial_theme_and_presets_unset_by_default()
    {
        Render<PkThemeEditor>();

        var options = Options(Assert.Single(_bridge.Invocations["mountThemeEditor"]));
        Assert.Equal(JsonValueKind.Null, options.GetProperty("initial").ValueKind);
        Assert.Equal(JsonValueKind.Null, options.GetProperty("presets").ValueKind);
    }

    [Fact]
    public async Task Theme_editor_raises_OnThemeChanged_with_the_exported_css()
    {
        var received = new List<string>();
        var cut = Render<PkThemeEditor>(p => p.Add(x => x.OnThemeChanged, EventCallback.Factory.Create<string>(this, css => received.Add(css))));

        var host = Assert.IsType<DotNetObjectReference<PkThemeEditorHost>>(Assert.Single(_bridge.Invocations["mountThemeEditor"]).Arguments[2]);
        await cut.InvokeAsync(() => host.Value.OnChange(":root { --color-accent: red; }"));

        Assert.Equal(new[] { ":root { --color-accent: red; }" }, received);
    }

    [Fact]
    public void Theme_editor_mounts_again_when_the_initial_theme_or_presets_change()
    {
        var cut = Render<PkThemeEditor>(p => p.Add(x => x.InitialTheme, "{\"shared\":{}}"));
        cut.Render(p => p.Add(x => x.InitialTheme, "{\"shared\":{}}"));
        Assert.Equal(1, Calls("mountThemeEditor"));

        cut.Render(p => p.Add(x => x.InitialTheme, "{\"shared\":{\"--radius-md\":\"2px\"}}"));
        Assert.Equal(2, Calls("mountThemeEditor"));
    }

    [Fact]
    public void Theme_editor_shows_the_preview_by_default()
    {
        Render<PkThemeEditor>();

        Assert.True(Options(Assert.Single(_bridge.Invocations["mountThemeEditor"])).GetProperty("preview").GetBoolean());
    }

    [Fact]
    public async Task Theme_editor_exports_resets_and_switches_theme_through_the_bridge()
    {
        _bridge.Setup<string?>("exportTheme", _ => true).SetResult(":root { --color-accent: red; }");
        var cut = Render<PkThemeEditor>();

        var css = await cut.InvokeAsync(() => cut.Instance.ExportAsync());
        await cut.InvokeAsync(() => cut.Instance.ResetAsync());
        await cut.InvokeAsync(() => cut.Instance.SetThemeAsync(PkTheme.Light));
        await cut.InvokeAsync(() => cut.Instance.SetThemeAsync(PkTheme.Auto)); // Auto is "leave it": nothing is sent

        Assert.Equal(":root { --color-accent: red; }", css);
        Assert.Equal(1, Calls("reset"));
        Assert.Equal("light", Assert.Single(_bridge.Invocations["setThemeMode"]).Arguments[1]);
    }

    [Fact]
    public async Task Theme_editor_destroys_the_javascript_side_when_disposed()
    {
        Render<PkThemeEditor>();

        await DisposeComponentsAsync();

        Assert.Equal(1, Calls("destroy"));
    }

    [Fact]
    public async Task Performance_console_logs_and_log_settings_mount_once_and_destroy_on_dispose()
    {
        Render<PkPerformance>(p => p.Add(x => x.Interval, 500).Add(x => x.AutoStart, false));
        Render<PkConsole>(p => p.Add(x => x.Tab, "network").Add(x => x.Max, 100));
        Render<PkLogs>(p => p.Add(x => x.Level, "warn").Add(x => x.Order, "oldest"));
        Render<PkLogSettings>(p => p.Add(x => x.Height, "24rem"));

        var performance = Options(Assert.Single(_bridge.Invocations["mountPerformance"]));
        Assert.Equal(500, performance.GetProperty("interval").GetInt32());
        Assert.False(performance.GetProperty("autostart").GetBoolean());
        Assert.Equal("network", Options(Assert.Single(_bridge.Invocations["mountConsole"])).GetProperty("tab").GetString());
        var logs = Options(Assert.Single(_bridge.Invocations["mountLogs"]));
        Assert.Equal("warn", logs.GetProperty("level").GetString());
        Assert.Equal("oldest", logs.GetProperty("order").GetString());
        Assert.Equal("24rem", Options(Assert.Single(_bridge.Invocations["mountLogSettings"])).GetProperty("height").GetString());

        await DisposeComponentsAsync();

        Assert.Equal(4, Calls("destroy"));
    }

    [Fact]
    public async Task Performance_and_logs_pause_and_resume_through_the_bridge()
    {
        var performance = Render<PkPerformance>();
        var logs = Render<PkLogs>();

        await performance.InvokeAsync(() => performance.Instance.PauseAsync());
        await performance.InvokeAsync(() => performance.Instance.ResumeAsync());
        await logs.InvokeAsync(() => logs.Instance.PauseAsync());
        await logs.InvokeAsync(() => logs.Instance.ClearAsync());

        Assert.Equal(2, Calls("pause"));
        Assert.Equal(1, Calls("resume"));
        Assert.Equal(1, Calls("clear"));
    }

    [Fact]
    public async Task Scorecard_mounts_its_targets_only_when_it_has_some_and_runs_through_the_bridge()
    {
        Render<PkScorecard>();
        Assert.Equal(0, Calls("mountScorecard"));

        var cut = Render<PkScorecard>(p => p.Add(x => x.Targets, [PkScoreTarget.Page("/a", "A"), PkScoreTarget.Markup("B", "<p>b</p>")]).Add(x => x.HistoryKey, "k").Add(x => x.AutoRun, true));
        var options = Options(Assert.Single(_bridge.Invocations["mountScorecard"]));
        Assert.Equal(2, options.GetProperty("targets").GetArrayLength());
        Assert.Equal("k", options.GetProperty("historyKey").GetString());
        Assert.True(options.GetProperty("autorun").GetBoolean());

        await cut.InvokeAsync(() => cut.Instance.RunAsync());
        Assert.Equal(1, Calls("run"));
    }

    // ---- the dev tools

    [Fact]
    public void Dev_tools_dock_mounts_with_the_blazor_callbacks_and_a_hidden_marker()
    {
        var cut = Render<PkDevTools>(p => p.Add(x => x.Tab, "blazor").Add(x => x.Open, true).Add(x => x.Size, PkDevToolsSize.Large).Add(x => x.Theme, PkTheme.Dark));

        var call = Assert.Single(_bridge.Invocations["mountDevTools"]);
        var options = Options(call);
        Assert.Equal("dock", options.GetProperty("mode").GetString());
        Assert.Equal("blazor", options.GetProperty("tab").GetString());
        Assert.True(options.GetProperty("open").GetBoolean());
        Assert.Equal("large", options.GetProperty("size").GetString());
        Assert.Equal("dark", options.GetProperty("theme").GetString());
        Assert.IsType<DotNetObjectReference<PkDevToolsHost>>(call.Arguments[2]);
        Assert.True(cut.Find("div").HasAttribute("hidden"));
    }

    [Fact]
    public void Dev_tools_medium_dock_and_default_hotkey_are_left_to_the_module()
    {
        Render<PkDevTools>();

        var options = Options(Assert.Single(_bridge.Invocations["mountDevTools"]));
        Assert.Equal(JsonValueKind.Null, options.GetProperty("size").ValueKind);
        Assert.Equal(JsonValueKind.Null, options.GetProperty("hotkey").ValueKind);
    }

    [Fact]
    public void Dev_tools_inline_fills_its_own_element_and_can_leave_the_blazor_tabs_out()
    {
        var cut = Render<PkDevTools>(p => p.Add(x => x.Mode, PkDevToolsMode.Inline).Add(x => x.BlazorPanels, false));

        var call = Assert.Single(_bridge.Invocations["mountDevTools"]);
        Assert.Equal("inline", Options(call).GetProperty("mode").GetString());
        Assert.Null(call.Arguments[2]);
        Assert.False(cut.Find("div").HasAttribute("hidden"));
    }

    [Fact]
    public async Task Dev_tools_drives_the_mounted_tools_when_the_tab_or_open_state_changes()
    {
        var cut = Render<PkDevTools>(p => p.Add(x => x.Tab, "console").Add(x => x.Open, false));

        cut.Render(p => p.Add(x => x.Tab, "logs").Add(x => x.Open, true));
        cut.Render(p => p.Add(x => x.Tab, "logs").Add(x => x.Open, false));

        Assert.Equal(1, Calls("mountDevTools")); // not mounted again
        Assert.Equal("logs", Assert.Single(_bridge.Invocations["selectTool"]).Arguments[1]);
        Assert.Equal(1, Calls("openTools"));
        Assert.Equal(1, Calls("closeTools"));

        await cut.InvokeAsync(() => cut.Instance.ToggleAsync());
        await cut.InvokeAsync(() => cut.Instance.SelectAsync("theme"));
        Assert.Equal(1, Calls("toggleTools"));
        Assert.Equal(2, Calls("selectTool"));
    }

    [Fact]
    public async Task Dev_tools_mounts_again_when_the_mode_changes_and_destroys_on_dispose()
    {
        var cut = Render<PkDevTools>();

        cut.Render(p => p.Add(x => x.Mode, PkDevToolsMode.Inline));
        Assert.Equal(2, Calls("mountDevTools"));

        await DisposeComponentsAsync();
        Assert.Equal(1, Calls("destroy"));
    }

    [Fact]
    public void Dev_tools_initializes_the_runtime_once()
    {
        Render<PkDevTools>();

        Assert.Single(_bridge.Invocations["init"]);
    }

    // ---- the dev tools workspace page (core/modules/devtools/workspace.js through the bridge)

    [Theory]
    [InlineData("scorecard", "scorecard", null)]
    [InlineData("files", "files", null)]
    [InlineData("console", "gallery", "console")]
    [InlineData("blazor-components", "gallery", "blazor-components")]
    [InlineData("nonsense", "gallery", null)]
    [InlineData(null, "gallery", null)]
    public void Dev_tools_workspace_maps_the_route_to_a_workspace_or_a_dock_tab(string? tab, string workspace, string? tool)
    {
        Render<PkDevToolsWorkspace>(p => p.Add(x => x.Tab, tab));

        var call = Assert.Single(_bridge.Invocations["mountDevToolsWorkspace"]);
        var options = Options(call);
        Assert.Equal(workspace, options.GetProperty("workspace").GetString());
        Assert.Equal(tool, options.GetProperty("tool").GetString());
        Assert.IsType<ElementReference>(call.Arguments[0]);
    }

    [Fact]
    public void Dev_tools_workspace_hands_over_the_blazor_gallery_sections_and_the_default_score_targets()
    {
        Render<PkDevToolsWorkspace>();

        var options = Options(Assert.Single(_bridge.Invocations["mountDevToolsWorkspace"]));
        var sections = options.GetProperty("gallery").GetProperty("sections");
        Assert.Equal(PkMappingInfo.Tags.Count, sections.GetArrayLength());
        var scorecard = options.GetProperty("scorecard");
        Assert.Equal("plainkit-devtools-scorecard", scorecard.GetProperty("historyKey").GetString());
        Assert.Equal(6, scorecard.GetProperty("targets").GetArrayLength());
        Assert.Equal("Template: crud", scorecard.GetProperty("targets")[0].GetProperty("name").GetString());
    }

    [Fact]
    public void Dev_tools_workspace_drives_the_mounted_page_for_a_new_route_instead_of_mounting_again()
    {
        var cut = Render<PkDevToolsWorkspace>(p => p.Add(x => x.Tab, "gallery"));

        cut.Render(p => p.Add(x => x.Tab, "scorecard"));
        cut.Render(p => p.Add(x => x.Tab, "console"));

        Assert.Equal(1, Calls("mountDevToolsWorkspace"));
        Assert.Equal("scorecard", Assert.Single(_bridge.Invocations["selectWorkspace"]).Arguments[1]);
        Assert.Equal("console", Assert.Single(_bridge.Invocations["selectDevToolsTab"]).Arguments[1]);
    }

    [Fact]
    public void Dev_tools_workspace_does_not_select_again_for_the_tab_the_reader_just_chose()
    {
        var cut = Render<PkDevToolsWorkspace>(p => p.Add(x => x.Tab, "gallery"));
        var chosen = new List<string>();
        cut.Render(p => p.Add(x => x.OnWorkspace, EventCallback.Factory.Create<string>(this, chosen.Add)));

        cut.InvokeAsync(() => cut.Instance.SetWorkspace("files"));
        cut.Render(p => p.Add(x => x.Tab, "files")); // the route follows the click

        Assert.Equal(["files"], chosen);
        Assert.Empty(_bridge.Invocations["selectWorkspace"]);
    }

    [Fact]
    public async Task Dev_tools_workspace_loads_the_snapshot_through_the_reader_only_when_asked()
    {
        var dir = Directory.CreateTempSubdirectory("pk-ws-");
        try
        {
            File.WriteAllText(Path.Combine(dir.FullName, "a.md"), "hello");
            await using var ctx = new BunitContext();
            ctx.JSInterop.Mode = JSRuntimeMode.Loose;
            ctx.Services.AddPlainKit(o => { o.DevTools = true; o.SourceRoot = dir.FullName; });
            var bridge = ctx.JSInterop.SetupModule(PkAssets.Bridge);
            bridge.Mode = JSRuntimeMode.Loose;
            var cut = ctx.Render<PkDevToolsWorkspace>();
            Assert.Single(bridge.Invocations["mountDevToolsWorkspace"]); // mounting alone reads nothing

            var loaded = JsonSerializer.SerializeToElement(await cut.InvokeAsync(() => cut.Instance.LoadFiles()));

            Assert.Equal(1, loaded.GetProperty("count").GetInt32());
        }
        finally { dir.Delete(true); }
    }

    [Fact]
    public async Task Dev_tools_workspace_says_there_is_no_source_without_a_snapshot()
    {
        var cut = Render<PkDevToolsWorkspace>();

        Assert.Null(await cut.InvokeAsync(() => cut.Instance.LoadFiles()));
    }

    [Fact]
    public async Task Dev_tools_workspace_destroys_the_js_side_and_tolerates_a_gone_circuit()
    {
        var cut = Render<PkDevToolsWorkspace>();
        _bridge.SetupVoid("destroy", _ => true).SetException(new JSDisconnectedException("gone"));

        await cut.Instance.DisposeAsync();

        Assert.Equal(1, Calls("destroy"));
    }
}
