using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 365: IPkStore, IPkSettings and IPkTheme over the same { v, data } envelope and pk.<module> keys as js/store.js.
public sealed class PkSharedStateTests : BunitContext, IAsyncLifetime
{
    private sealed class FakeStorage : IPkStorage
    {
        public readonly Dictionary<string, string> Items = [];
        public readonly List<string> Warnings = [];
        public ValueTask<string?> GetAsync(string key) => ValueTask.FromResult(Items.GetValueOrDefault(key));
        public ValueTask SetAsync(string key, string value) { Items[key] = value; return ValueTask.CompletedTask; }
        public void Warn(string message) => Warnings.Add(message);
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly FakeStorage Storage = new();

    public PkSharedStateTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddScoped<IPkStorage>(_ => Storage);
    }

    private static PkStoreSpec Gallery => new()
    {
        Defaults = new Dictionary<string, object?> { ["scale"] = 1.0, ["width"] = "wide", ["open"] = false },
        Persist = ["scale", "width"],
        Publish = ["scale"],
        Rules = new Dictionary<string, PkStoreRule> { ["scale"] = new(Min: 0.5, Max: 2), ["width"] = new(Allowed: ["narrow", "wide"]) }
    };

    [Fact]
    public async Task Persists_only_the_persist_keys_in_the_shared_envelope()
    {
        var store = Services.GetRequiredService<IPkStore>();
        var m = await store.OpenAsync("gallery", Gallery);
        Assert.True(await m.SetAsync("scale", 1.25));
        Assert.True(await m.SetAsync("open", true));
        Assert.Equal("""{"v":1,"data":{"scale":1.25,"width":"wide"}}""", Storage.Items["pk.gallery"]);
    }

    [Fact]
    public async Task Reads_what_the_javascript_store_wrote()
    {
        Storage.Items["pk.gallery"] = """{"v":1,"data":{"scale":1.5,"width":"narrow"}}""";
        var m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        Assert.Equal(1.5, m.Get<double>("scale", 0));
        Assert.Equal("narrow", m.Get("width"));
        Assert.Empty(Storage.Warnings);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[1,2]")]
    [InlineData("""{"v":2,"data":{"scale":1.5}}""")]
    [InlineData("""{"v":0,"data":{"scale":1.5}}""")]
    [InlineData("""{"v":1,"data":[]}""")]
    [InlineData("""{"v":1}""")]
    public async Task Corrupt_or_other_version_data_gives_the_defaults_and_one_warning(string stored)
    {
        Storage.Items["pk.gallery"] = stored;
        var m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        Assert.Equal(1.0, m.Get("scale"));
        Assert.Single(Storage.Warnings);
    }

    [Fact]
    public async Task Wrong_type_out_of_range_unknown_and_oversized_values_fall_back_one_key_at_a_time()
    {
        Storage.Items["pk.gallery"] = """{"v":1,"data":{"scale":9,"width":"huge","open":true,"extra":1}}""";
        var m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        Assert.Equal(1.0, m.Get("scale"));
        Assert.Equal("wide", m.Get("width"));
        Assert.Equal(false, m.Get("open"));
        Assert.Single(Storage.Warnings);
        Assert.Contains("invalid scale", Storage.Warnings[0]);
        Assert.Contains("unknown open", Storage.Warnings[0]);

        await m.DisposeAsync();
        Storage.Warnings.Clear();
        Storage.Items["pk.gallery"] = new string(' ', 70000) + """{"v":1,"data":{"scale":1.5}}""";
        m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        Assert.Equal(1.0, m.Get("scale"));
        Assert.Single(Storage.Warnings);
    }

    [Fact]
    public async Task Set_refuses_bad_values_without_throwing()
    {
        var m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        Assert.False(await m.SetAsync("scale", "big"));
        Assert.False(await m.SetAsync("scale", 5));
        Assert.False(await m.SetAsync("width", "huge"));
        Assert.False(await m.SetAsync("nope", 1));
        Assert.False(await m.SetAsync("scale", double.NaN));
        Assert.False(await m.SetAsync("scale", new object()));
        Assert.Equal(1.0, m.Get("scale"));
        Assert.False(Storage.Items.ContainsKey("pk.gallery"));
    }

    [Fact]
    public async Task Modules_are_isolated_and_only_published_keys_are_readable_by_others()
    {
        var store = Services.GetRequiredService<IPkStore>();
        var a = await store.OpenAsync("gallery", Gallery);
        var b = await store.OpenAsync("other", new PkStoreSpec { Defaults = new Dictionary<string, object?> { ["scale"] = 3.0 }, Persist = ["scale"] });
        await a.SetAsync("scale", 1.75);
        await a.SetAsync("width", "narrow");
        Assert.Equal(3.0, b.Get("scale"));
        Assert.Null(b.Get("width"));
        var seen = store.Read("gallery");
        Assert.Equal(1.75, seen["scale"]);
        Assert.False(seen.ContainsKey("width"));
        Assert.Empty(store.Read("other"));
        Assert.Empty(store.Read("missing"));
        Assert.IsNotType<Dictionary<string, object?>>(seen);
    }

    [Theory]
    [InlineData("Bad")]
    [InlineData("")]
    [InlineData("1a")]
    [InlineData("has space")]
    public async Task A_bad_module_id_throws(string id)
    {
        await Assert.ThrowsAsync<ArgumentException>(async () => await Services.GetRequiredService<IPkStore>().OpenAsync(id, Gallery));
    }

    [Fact]
    public async Task A_taken_id_throws_until_the_module_is_disposed()
    {
        var store = Services.GetRequiredService<IPkStore>();
        var m = await store.OpenAsync("gallery", Gallery);
        await Assert.ThrowsAsync<ArgumentException>(async () => await store.OpenAsync("gallery", Gallery));
        await m.DisposeAsync();
        await store.OpenAsync("gallery", Gallery);
    }

    [Fact]
    public async Task Changed_fires_with_the_whole_state_only_on_a_change_and_stops_after_dispose()
    {
        var m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        var seen = new List<object?>();
        m.Changed += s => seen.Add(s["scale"]);
        await m.SetAsync("scale", 1.5);
        await m.SetAsync("scale", 1.5);
        await m.ResetAsync();
        Assert.Equal([1.5, 1.0], seen);
        await m.DisposeAsync();
        Assert.False(await m.SetAsync("scale", 2));
        Assert.Equal(2, seen.Count);
    }

    [Fact]
    public async Task A_throwing_subscriber_is_logged_and_does_not_stop_the_others()
    {
        var m = await Services.GetRequiredService<IPkStore>().OpenAsync("gallery", Gallery);
        var ok = 0;
        m.Changed += _ => throw new InvalidOperationException("boom");
        m.Changed += _ => ok++;
        Assert.True(await m.SetAsync("scale", 1.5));
        Assert.Equal(1, ok);
        Assert.Contains(Storage.Warnings, w => w.Contains("subscriber"));
    }

    [Fact]
    public async Task Disposing_the_store_frees_every_module()
    {
        var store = Services.GetRequiredService<IPkStore>();
        var m = await store.OpenAsync("gallery", Gallery);
        var fired = 0;
        m.Changed += _ => fired++;
        await store.DisposeAsync();
        Assert.False(await m.SetAsync("scale", 1.5));
        Assert.Equal(0, fired);
        Assert.Empty(store.Read("gallery"));
    }

    [Fact]
    public async Task Settings_round_trip_typed_values_and_fall_back()
    {
        var s = Services.GetRequiredService<IPkSettings>();
        Assert.Equal(7, await s.GetAsync("reports", "page-size", 7));
        Assert.True(await s.SetAsync("reports", "page-size", 25));
        Assert.True(await s.SetAsync("reports", "compact", true));
        Assert.Equal(25, await s.GetAsync("reports", "page-size", 7));
        Assert.True(await s.GetAsync("reports", "compact", false));
        Assert.Equal("""{"v":1,"data":{"page-size":25,"compact":true}}""", Storage.Items["pk.settings-reports"]);
        Assert.False(await s.SetAsync("reports", "x", new object()));
        Assert.False(await s.SetAsync("Bad Module", "x", 1));
        Assert.Equal(3, await s.GetAsync("Bad Module", "x", 3));
    }

    [Fact]
    public async Task Settings_of_two_modules_do_not_see_each_other_and_ignore_corrupt_data()
    {
        Storage.Items["pk.settings-other"] = "{{{";
        var s = Services.GetRequiredService<IPkSettings>();
        await s.SetAsync("reports", "k", "v");
        Assert.Equal("none", await s.GetAsync("other", "k", "none"));
        Assert.Single(Storage.Warnings);
    }

    [Fact]
    public async Task Theme_defaults_to_dark_persists_notifies_and_applies_to_the_page()
    {
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        var theme = Services.GetRequiredService<IPkTheme>();
        var seen = new List<string>();
        theme.Changed += seen.Add;
        await theme.InitializeAsync();
        Assert.Equal("dark", theme.Current);
        await theme.ToggleAsync();
        Assert.Equal("light", theme.Current);
        Assert.False(await theme.SetAsync("purple"));
        Assert.Equal("light", theme.Current);
        Assert.Equal("""{"v":1,"data":{"theme":"light"}}""", Storage.Items["pk.theme"]);
        Assert.Equal(["light"], seen);
        Assert.Equal("light", bridge.Invocations["applyTheme"].Last().Arguments[0]);
    }

    [Fact]
    public async Task Theme_reads_the_stored_choice_and_ignores_a_foreign_value()
    {
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Storage.Items["pk.theme"] = """{"v":1,"data":{"theme":"light"}}""";
        var theme = Services.GetRequiredService<IPkTheme>();
        await theme.InitializeAsync();
        Assert.Equal("light", theme.Current);

        await using var other = new PkSharedStateTests();
        other.JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        other.Storage.Items["pk.theme"] = """{"v":1,"data":{"theme":"</style><script>"}}""";
        var t2 = other.Services.GetRequiredService<IPkTheme>();
        await t2.InitializeAsync();
        Assert.Equal("dark", t2.Current);
        Assert.Single(other.Storage.Warnings);
    }

    [Fact]
    public async Task Storage_falls_back_to_memory_with_one_warning_when_interop_is_unavailable()
    {
        await using var ctx = new BunitContext();
        ctx.JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = ctx.JSInterop.SetupModule(PkAssets.Bridge);
        bridge.SetupVoid("storageSet", _ => true).SetException(new Microsoft.JSInterop.JSException("blocked"));
        bridge.Setup<string?>("storageGet", _ => true).SetException(new Microsoft.JSInterop.JSException("blocked"));
        var logged = new List<string>();
        var storage = new PkStorage(new PkRuntime(ctx.JSInterop.JSRuntime), new CapturingLog(logged));
        Assert.Null(await storage.GetAsync("pk.a"));
        await storage.SetAsync("pk.a", "1");
        Assert.Equal("1", await storage.GetAsync("pk.a"));
        await Task.Delay(50);
        Assert.Single(logged);
    }

    private sealed class CapturingLog(List<string> into) : IPkLog
    {
        public ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null) { into.Add(message); return ValueTask.CompletedTask; }
        public ValueTask SetLevelAsync(PkLogLevel level) => ValueTask.CompletedTask;
        public ValueTask ConfigureAsync(PkLoggingOptions settings) => ValueTask.CompletedTask;
    }

    [Fact]
    public async Task Storage_goes_through_the_bridge_when_it_works()
    {
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Setup<string?>("storageGet", "pk.theme").SetResult("""{"v":1,"data":{"theme":"light"}}""");
        var storage = new PkStorage(Services.GetRequiredService<PkRuntime>());
        Assert.Equal("""{"v":1,"data":{"theme":"light"}}""", await storage.GetAsync("pk.theme"));
        bridge.SetupVoid("storageSet", "pk.theme", "x").SetVoidResult();
        await storage.SetAsync("pk.theme", "x");
        bridge.VerifyInvoke("storageSet");
    }

    [Fact]
    public void Nothing_reaches_javascript_until_a_module_is_opened()
    {
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _ = Services.GetRequiredService<IPkStore>();
        _ = Services.GetRequiredService<IPkSettings>();
        _ = Services.GetRequiredService<IPkTheme>();
        Assert.Empty(JSInterop.Invocations);
        Assert.Empty(bridge.Invocations);
    }
}
