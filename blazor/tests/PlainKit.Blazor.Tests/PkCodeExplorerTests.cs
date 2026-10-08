using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkCodeExplorer over a snapshot built in memory (#959): the page must never receive the file contents up front. A 2500 file, 13 MB source root sent as one
// interop argument froze the browser tab on the dev tools Files tab, so the component hands the bridge a lean list (path, language, line count) and a reference
// the explorer's lazy provider reads each file's text through, on demand.
public sealed class PkCodeExplorerTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkCodeExplorerTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static PkSnapshot Big(int files, int bytesEach) => new()
    {
        Files = [.. Enumerable.Range(0, files).Select(i => new PkSnapshotFile
        {
            Path = $"src/f{i}.js", Language = "js", Content = string.Concat(Enumerable.Repeat("const a = 1;\n", bytesEach / 13)),
        })],
    };

    [Fact]
    public void A_big_snapshot_goes_to_the_page_as_a_lean_list_and_a_reader_never_as_file_contents()
    {
        var snapshot = Big(2500, 5200);
        Render<PkCodeExplorer>(p => p.Add(x => x.Snapshot, snapshot));

        var call = Assert.Single(_bridge.Invocations["mountCodeExplorer"]);
        var options = call.Arguments[1]!;
        static object? Prop(object? o, string n) => o?.GetType().GetProperty(n)?.GetValue(o);
        var lazy = Prop(options, "lazy");
        Assert.NotNull(lazy);
        var json = JsonSerializer.Serialize(Prop(lazy, "files"));
        Assert.Null(Prop(options, "snapshot"));
        Assert.True(json.Length < 400_000, $"the options sent to the page are {json.Length} bytes: the file contents went across interop");
        Assert.DoesNotContain("const a = 1;", json);
        Assert.Contains("src/f2499.js", json);
        Assert.NotNull(Prop(lazy, "reader"));
    }

    [Fact]
    public void The_reader_the_page_calls_returns_one_files_text_and_null_for_an_unknown_path()
    {
        var snapshot = Big(3, 130);
        var reader = new PkSnapshotReader(snapshot);

        Assert.Equal(snapshot.Files[1].Content, reader.Read("src/f1.js"));
        Assert.Null(reader.Read("nope.js"));
        reader.Dispose();
    }

    [Fact]
    public void A_snapshot_url_is_still_passed_through_for_the_page_to_fetch()
    {
        Render<PkCodeExplorer>(p => p.Add(x => x.SnapshotUrl, "/files/snapshot.json"));
        var json = JsonSerializer.Serialize(Assert.Single(_bridge.Invocations["mountCodeExplorer"]).Arguments[1]);
        Assert.Contains("/files/snapshot.json", json);
    }
}
