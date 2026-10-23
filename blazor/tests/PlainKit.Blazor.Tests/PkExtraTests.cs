using System.Reflection;
using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #1656, phase 1 of the Blazor option model: the declaration (project file and o.Extras), the attribute on the components of an optional package, and the list handed to the bridge.
public sealed class PkExtraTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    [Fact]
    public void nothing_chosen_allows_everything_and_tells_the_bridge_nothing()
    {
        var set = new PkOptions().Extras;
        Assert.All(Enum.GetValues<PkExtra>(), e => Assert.True(set.Has(e)));
        Assert.Null(set.Names);
    }

    [Fact]
    public void Add_chooses_core_plus_the_named_extras()
    {
        var set = new PkOptions().Extras.Add(PkExtra.Dock, PkExtra.Canvas);
        Assert.True(set.Has(PkExtra.Dock) && set.Has(PkExtra.Canvas));
        Assert.False(set.Has(PkExtra.Markdown));
        Assert.Equal(["canvas", "dock"], set.Names!);
    }

    [Fact]
    public void AddAll_is_the_same_as_choosing_nothing()
    {
        var set = new PkOptions().Extras.AddAll();
        Assert.All(Enum.GetValues<PkExtra>(), e => Assert.True(set.Has(e)));
        Assert.Null(set.Names);
    }

    [Fact]
    public void the_project_file_list_wins_and_may_be_a_superset_of_the_code()
    {
        var set = new PkOptions().Extras.Add(PkExtra.Dock);
        set.Reconcile("dock;markdown");
        Assert.Equal(["dock", "markdown"], set.Names!);
        var none = new PkOptions().Extras;
        none.Reconcile("Canvas, tools");
        Assert.Equal(["canvas", "tools"], none.Names!);
    }

    [Fact]
    public void full_in_the_project_file_means_everything()
    {
        var set = new PkOptions().Extras;
        set.Reconcile("full");
        Assert.Null(set.Names);
    }

    [Fact]
    public void code_that_names_an_extra_the_project_file_does_not_is_a_startup_error()
    {
        var set = new PkOptions().Extras.Add(PkExtra.Markdown);
        var e = Assert.Throws<InvalidOperationException>(() => set.Reconcile("dock"));
        Assert.Contains("'markdown'", e.Message);
        Assert.Contains("<PlainKitExtras>", e.Message);
    }

    [Fact]
    public void an_unknown_name_in_the_project_file_lists_the_valid_ones()
    {
        var e = Assert.Throws<InvalidOperationException>(() => new PkOptions().Extras.Reconcile("dock;nonsense"));
        Assert.Contains("'nonsense'", e.Message);
        Assert.Contains("tools, markdown, dock, canvas", e.Message);
    }

    [Fact]
    public void an_empty_project_property_changes_nothing()
    {
        var set = new PkOptions().Extras.Add(PkExtra.Dock);
        set.Reconcile("  ");
        set.Reconcile(null);
        Assert.Equal(["dock"], set.Names!);
    }

    [Fact]
    public void the_build_writes_the_list_into_the_app_assembly_and_it_is_read_back()
    {
        // The test assembly has no PlainKitExtras metadata (this project does not set the property): nothing declared.
        Assert.Null(PkExtraSet.FromAssembly(typeof(PkExtraTests).Assembly));
        Assert.Null(PkExtraSet.FromAssembly(null));
    }

    [Fact]
    public void every_element_of_an_optional_package_has_a_component_that_says_so()
    {
        using var stream = typeof(PkAssets).Assembly.GetManifestResourceStream("plainkit-extras.json")!;
        var table = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(stream)!;
        var members = Enum.GetNames<PkExtra>().Select(n => n.ToLowerInvariant()).ToHashSet();
        Assert.Equal(members, table.Keys.ToHashSet());
        var tagCount = 0;
        foreach (var (name, entry) in table)
            foreach (var tag in entry.GetProperty("tags").EnumerateArray().Select(t => t.GetString()!))
            {
                tagCount++;
                var type = typeof(PkAssets).Assembly.GetTypes().Single(t => t.IsClass && t.Name == string.Concat("Pk", string.Concat(tag[3..].Split('-').Select(w => char.ToUpperInvariant(w[0]) + w[1..]))));
                var attribute = type.GetCustomAttribute<PkRequiresExtraAttribute>();
                Assert.True(attribute is not null, $"{type.Name} (<{tag}>) needs [PkRequiresExtra(PkExtra.{name})]");
                Assert.Equal(name, attribute.Extra.ToString().ToLowerInvariant());
            }
        Assert.True(tagCount >= 5);
    }

    [Fact]
    public void components_of_the_core_package_carry_no_attribute()
    {
        Assert.Null(typeof(PkButton).GetCustomAttribute<PkRequiresExtraAttribute>());
    }

    [Fact]
    public async Task the_runtime_hands_the_declared_list_to_the_bridge_and_null_when_nothing_was_chosen()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit(o => o.Extras.Add(PkExtra.Dock, PkExtra.Markdown));
        await Services.GetRequiredService<PkRuntime>().EnsureInitializedAsync();
        Assert.Equal(["dock", "markdown"], (string[])bridge.Invocations["init"].Single().Arguments.Single()!);
    }

    [Fact]
    public async Task the_default_declaration_sends_null()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        await Services.GetRequiredService<PkRuntime>().EnsureInitializedAsync();
        Assert.Equal([null], bridge.Invocations["init"].Single().Arguments);
    }
}
