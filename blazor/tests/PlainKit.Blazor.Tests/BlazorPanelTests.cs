using System.Text.RegularExpressions;
using Bunit;
using Microsoft.AspNetCore.Components.Server.Circuits;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

/// <summary>What the dev tools' Blazor panel and the inspector's Blazor section show: real counts from the bridge, the circuit handler, and the mappings.</summary>
public sealed class BlazorPanelTests : TestContext
{
    private readonly BunitJSModuleInterop _bridge;

    public BlazorPanelTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit(o => o.DevTools = true);
    }

    // ---- interop counts

    [Fact]
    public async Task Every_bridge_call_is_counted_and_timed_per_function()
    {
        var runtime = Services.GetRequiredService<PkRuntime>();
        var bridge = await runtime.BridgeAsync();

        await bridge.InvokeVoidAsync("mountLogs", "a");
        await bridge.InvokeVoidAsync("mountLogs", "b");
        await bridge.InvokeVoidAsync("pause");

        var snapshot = runtime.Interop.Snapshot();
        Assert.Equal(3, snapshot.Calls);
        Assert.Equal(0, snapshot.Errors);
        var logs = Assert.Single(snapshot.ByIdentifier, c => c.Identifier == "mountLogs");
        Assert.Equal(2, logs.Calls);
        Assert.True(logs.MaxMs >= 0 && logs.AverageMs >= 0);
        Assert.Equal(2, _bridge.Invocations["mountLogs"].Count); // and the call still reached the module
    }

    [Fact]
    public async Task A_failed_bridge_call_is_recorded_with_its_error_and_still_throws()
    {
        _bridge.SetupVoid("mountScorecard", _ => true).SetException(new JSException("no such target"));
        var runtime = Services.GetRequiredService<PkRuntime>();
        var bridge = await runtime.BridgeAsync();

        var thrown = await Assert.ThrowsAsync<JSException>(async () => await bridge.InvokeVoidAsync("mountScorecard", "x"));

        var snapshot = runtime.Interop.Snapshot();
        Assert.Equal("no such target", thrown.Message);
        Assert.Equal(1, snapshot.Errors);
        var error = Assert.Single(snapshot.RecentErrors);
        Assert.Equal(("mountScorecard", nameof(JSException), "no such target"), (error.Identifier, error.Type, error.Message));
        Assert.Equal(1, Assert.Single(snapshot.ByIdentifier).Errors);
    }

    [Fact]
    public void Only_the_newest_errors_are_kept()
    {
        var log = new PkInteropLog();
        for (var i = 0; i < PkInteropLog.MaxErrors + 5; i++) log.Record("f", 1, new InvalidOperationException($"e{i}"));

        var snapshot = log.Snapshot();
        Assert.Equal(PkInteropLog.MaxErrors + 5, snapshot.Errors);
        Assert.Equal(PkInteropLog.MaxErrors, snapshot.RecentErrors.Count);
        Assert.Equal("e5", snapshot.RecentErrors[0].Message);
    }

    // ---- the host the panel reads

    [Fact]
    public async Task Snapshot_reports_the_host_the_runtime_and_the_interop_counts()
    {
        _bridge.Setup<string>("version").SetResult("9.9.9");
        var runtime = Services.GetRequiredService<PkRuntime>();
        await runtime.EnsureInitializedAsync();
        var host = new PkDevToolsHost(runtime, new PkOptions(), circuit: null);

        var snapshot = await host.Snapshot();

        Assert.Equal("Blazor Server", snapshot.Host);
        Assert.Equal(PkAssets.Version, snapshot.PackageVersion);
        Assert.Equal("9.9.9", snapshot.SdkVersion);
        Assert.True(snapshot.RuntimeInitialized);
        Assert.False(snapshot.ForwardingToILogger);
        Assert.Null(snapshot.Circuit);
        Assert.Contains(snapshot.Interop.ByIdentifier, c => c.Identifier == "init");
        Assert.Contains(snapshot.Interop.ByIdentifier, c => c.Identifier == "version");
    }

    [Fact]
    public async Task Reading_a_snapshot_is_not_a_bridge_call_except_the_version_once()
    {
        _bridge.Setup<string>("version").SetResult("1.0.0");
        var runtime = Services.GetRequiredService<PkRuntime>();
        var host = new PkDevToolsHost(runtime, new PkOptions());

        await host.Snapshot();
        var after = (await host.Snapshot()).Interop.Calls;
        await host.Snapshot();

        Assert.Equal(1, after); // the version, read once and kept
        Assert.Equal(1, runtime.Interop.Snapshot().Calls);
    }

    [Fact]
    public async Task Snapshot_shows_the_version_as_unknown_when_the_bridge_cannot_answer()
    {
        _bridge.Setup<string>("version").SetException(new JSDisconnectedException("gone"));
        var runtime = Services.GetRequiredService<PkRuntime>();

        var snapshot = await new PkDevToolsHost(runtime, new PkOptions()).Snapshot();

        Assert.Null(snapshot.SdkVersion);
        Assert.Equal(1, snapshot.Interop.Errors);
    }

    [Fact]
    public async Task Snapshot_carries_the_circuit_state_when_there_is_one()
    {
        var circuit = new PkCircuitState();
        var snapshot = await new PkDevToolsHost(Services.GetRequiredService<PkRuntime>(), new PkOptions(), circuit).Snapshot();

        Assert.Equal("None", snapshot.Circuit!.Phase);
        Assert.Equal((0, 0), (snapshot.Circuit.Disconnects, snapshot.Circuit.Reconnects));
    }

    [Fact]
    public void The_circuit_handler_is_registered_on_the_server_and_is_the_same_instance_per_scope()
    {
        using var scope = Services.CreateScope();

        var handler = Assert.Single(scope.ServiceProvider.GetServices<CircuitHandler>());
        Assert.Same(scope.ServiceProvider.GetRequiredService<PkCircuitState>(), handler);
    }

    // ---- the inspector's Blazor section (mappings and the manifest carried by the assembly)

    private static Dictionary<string, string> Attrs(params (string, string)[] pairs) => pairs.ToDictionary(p => p.Item1, p => p.Item2);

    [Fact]
    public void Describes_a_generated_component_with_typed_parameters_defaults_and_events()
    {
        var info = PkMappingInfo.Describe("pk-button", new Dictionary<string, string?> { ["variant"] = "primary", ["disabled"] = "false" })!;

        Assert.Equal(("PkButton", "generated", null), (info.Component, info.Status, info.Note));
        var variant = info.Parameters.Single(p => p.Name == "Variant");
        Assert.Equal(("parameter", "ButtonVariant", "primary", "variant"), (variant.Kind, variant.Type, variant.Default, variant.Attribute));
        Assert.Equal("bool", info.Parameters.Single(p => p.Name == "Disabled").Type);
        Assert.Equal(("event", "EventCallback<MouseEventArgs>"), (info.Parameters.Single(p => p.Name == "OnClick").Kind, info.Parameters.Single(p => p.Name == "OnClick").Type));
        Assert.Equal(("content", "RenderFragment"), (info.Parameters.Single(p => p.Name == "ChildContent").Kind, info.Parameters.Single(p => p.Name == "ChildContent").Type));
    }

    [Fact]
    public void A_value_driven_by_a_change_event_is_two_way_and_its_event_carries_the_typed_detail()
    {
        var info = PkMappingInfo.Describe("pk-input")!;

        Assert.True(info.Parameters.Single(p => p.Name == "Value").TwoWay);
        Assert.False(info.Parameters.Single(p => p.Name == "Placeholder").TwoWay);
        Assert.StartsWith("EventCallback<Pk", info.Parameters.Single(p => p.Name == "OnSearch").Type);
    }

    [Fact]
    public void Razor_markup_follows_the_elements_attributes_and_text()
    {
        var info = PkMappingInfo.Describe("pk-button", attributes: Attrs(("variant", "primary"), ("size", "mini"), ("disabled", ""), ("busy-text", "Saving \"x\""), ("class", "wide")), text: " Save ")!;

        Assert.Equal("<PkButton\n    Variant=\"ButtonVariant.Primary\"\n    Size=\"ButtonSize.Mini\"\n    Disabled\n    BusyText=\"Saving &quot;x&quot;\">Save</PkButton>", info.Markup.Replace("\r\n", "\n"));
    }

    [Fact]
    public void Razor_markup_binds_the_two_way_parameter_and_falls_back_to_a_bare_component()
    {
        Assert.Equal("<PkInput @bind-Value=\"_value\" Placeholder=\"Name\" />", PkMappingInfo.Describe("pk-input", attributes: Attrs(("value", "Ada"), ("placeholder", "Name")))!.Markup);
        Assert.Equal("<PkButton>...</PkButton>", PkMappingInfo.Describe("pk-button")!.Markup);
        Assert.Equal("<PkInput />", PkMappingInfo.Describe("pk-input")!.Markup);
    }

    [Fact]
    public void An_enum_value_the_mapping_renames_uses_the_mapped_member()
    {
        var info = PkMappingInfo.Describe("pk-alert", attributes: Attrs(("kind", "danger")), text: "Oops")!;

        Assert.Equal("<PkAlert Kind=\"PkAlertKind.Error\">Oops</PkAlert>", info.Markup);
        Assert.Contains(info.Parameters, p => p is { Name: "Dismissible", Default: null });
    }

    [Fact]
    public void Hand_written_components_say_that()
    {
        var table = PkMappingInfo.Describe("pk-table")!;
        Assert.Equal("hand-written", table.Status);   // the last element without a component, hand-written now (Components/PkTable.razor)
        Assert.Equal("hand-written", PkMappingInfo.Describe("pk-card")!.Status);

        Assert.Equal("hand-written", PkMappingInfo.Describe("pk-gallery")!.Status);
        Assert.Null(PkMappingInfo.Describe("pk-nonsense"));
    }

    [Fact]
    public void Parameters_the_generator_leaves_out_are_marked_with_its_reason()
    {
        var dialog = PkMappingInfo.Describe("pk-dialog")!;

        Assert.Contains("wrapper behaviour", dialog.Parameters.Single(p => p.Name == "CloseButtonLabel").NotGenerated);
        Assert.Null(dialog.Parameters.Single(p => p.Name == "ShowCloseButton").NotGenerated); // implemented as an attribute (inverted)
        Assert.Equal("PkChartData", PkMappingInfo.Describe("pk-chart")!.Parameters.Single(p => p.Name == "Data").Type); // a JSON parameter shows its record (issue #77)
        Assert.Equal("IReadOnlyList<PkGalleryImage>", PkMappingInfo.Describe("pk-image-gallery")!.Parameters.Single(p => p.Name == "Images").Type);
    }

    [Fact]
    public void Every_mapping_is_described_and_every_generated_component_lists_the_parameters_it_really_has()
    {
        var root = FindRepoRoot();
        var generated = Path.Combine(root, "blazor", "src", "PlainKit.Blazor", "Generated");
        Assert.NotEmpty(PkMappingInfo.Tags);
        var problems = new List<string>();
        foreach (var tag in PkMappingInfo.Tags)
        {
            var info = PkMappingInfo.Describe(tag);
            Assert.NotNull(info);
            var file = Path.Combine(generated, info.Component + ".razor");
            Assert.Equal(File.Exists(file), info.Status == "generated");
            if (info.Status != "generated") continue;
            var real = Regex.Matches(File.ReadAllText(file), @"\[Parameter(?:\([^)]*\))?\]\s+public\s+[^\s]+(?:<[^>]*>)?\??\s+(\w+)\s*\{")
                .Select(m => m.Groups[1].Value).Where(n => n is not "AdditionalAttributes" and not "ExtraClass").Distinct().Order().ToList();
            var described = info.Parameters.Where(p => p.NotGenerated is null && p.Name is not "AdditionalAttributes" and not "ExtraClass").Select(p => p.Name).Distinct().Order().ToList();
            if (!real.SequenceEqual(described)) problems.Add($"{info.Component}: razor [{string.Join(", ", real.Except(described))}] only, mapping [{string.Join(", ", described.Except(real))}] only");
        }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    private static string FindRepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "Directory.Build.props"))) return dir.FullName;
        throw new InvalidOperationException("repository root not found");
    }
}
