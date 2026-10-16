using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1022: PkLifecycle against core/tests/fixtures/page-lifecycle.json, which core/tests/page-lifecycle.test.mjs also reads; PageBase wiring on top.
public sealed class PkLifecycleTests : BunitContext
{
    private static readonly JsonElement Fixture = JsonDocument.Parse(File.ReadAllText(FixturePath())).RootElement;

    private static string FixturePath()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "core", "tests", "fixtures", "page-lifecycle.json");
            if (File.Exists(file)) return file;
        }
        throw new FileNotFoundException("core/tests/fixtures/page-lifecycle.json");
    }

    public static IEnumerable<object[]> Cases() => Fixture.GetProperty("cases").EnumerateArray().Select(c => new object[] { c.GetProperty("name").GetString()! });

    private static string Text(JsonElement v) => v.ValueKind == JsonValueKind.Null ? "undefined" : v.ToString();

    // No timing: every continuation runs inline (see Def) and a run starts on the calling thread, so a step has finished when it returns.
    private static Task Settle() => Task.CompletedTask;

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task MatchesTheSharedFixture(string name)
    {
        var c = Fixture.GetProperty("cases").EnumerateArray().Single(x => x.GetProperty("name").GetString() == name);
        var ex = c.GetProperty("expect");
        List<string> states = [], applied = [], rejected = [], aborted = [], runs = [];
        var pageErrors = 0;
        var defs = new Dictionary<string, TaskCompletionSource<string>>();
        using var external = new CancellationTokenSource();
        using var life = new PkLifecycle(() => { }, external.Token);
        Task Fail(Exception _) { pageErrors++; return Task.CompletedTask; }
        TaskCompletionSource<string> Def(string id) => defs[id] = new();
        Task<string> Load(string id, CancellationToken token)
        {
            token.Register(() => aborted.Add(id));
            return defs[id].Task;
        }
        void StartLoad(string id) => _ = life.LoadAsync(token => Load(id, token), v => applied.Add($"{id}:{v}"), e => { rejected.Add($"{id}:{e.Message}"); return Fail(e); });
        var loaded = false;
        foreach (var s in c.GetProperty("steps").EnumerateArray())
        {
            var op = s.GetProperty("op").GetString();
            var id = s.TryGetProperty("id", out var i) ? i.GetString()! : "";
            var value = s.TryGetProperty("value", out var v) ? Text(v) : "";
            switch (op)
            {
                case "load": Def(id); loaded = true; StartLoad(id); break;
                case "refresh": Def(id); if (!life.Disposed && loaded) StartLoad(id); break;
                case "run":
                    var d = Def(id);
                    _ = ((Func<Task>)(async () =>
                    {
                        try { var r = await life.RunAsync<string>(s.GetProperty("label").GetString(), _ => d.Task, Fail); runs.Add($"{id}:ok:{r ?? "undefined"}"); }
                        catch (Exception e) { runs.Add($"{id}:err:{e.Message}"); }
                    }))();
                    break;
                case "resolve": defs[id].SetResult(value); break;
                case "reject": defs[id].SetException(value == "AbortError" ? new OperationCanceledException() : new InvalidOperationException(value)); break;
                case "abort": external.Cancel(); break;
                default: life.Dispose(); break;
            }
            await Settle();
            states.Add(life.State);
        }
        static List<string> Pairs(JsonElement list) => list.EnumerateArray().Select(p => $"{p[0].GetString()}:{Text(p[1])}").ToList();
        Assert.Equal(ex.GetProperty("states").EnumerateArray().Select(x => x.GetString()!), states);
        Assert.Equal(Pairs(ex.GetProperty("applied")), applied);
        Assert.Equal(Pairs(ex.GetProperty("rejected")), rejected);
        Assert.Equal(ex.GetProperty("aborted").EnumerateArray().Select(x => x.GetString()!), aborted);
        Assert.Equal(ex.GetProperty("runs").EnumerateArray().Select(p => $"{p[0].GetString()}:{p[1].GetString()}"), runs);
        Assert.Equal(ex.GetProperty("pageErrors").GetInt32(), pageErrors);
        Assert.False(life.IsBusy);
    }

    private sealed class FakeLog : IPkLog
    {
        public ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null) => ValueTask.CompletedTask;
        public ValueTask SetLevelAsync(PkLogLevel level) => ValueTask.CompletedTask;
        public ValueTask ConfigureAsync(PkLoggingOptions settings) => ValueTask.CompletedTask;
    }

    private IRenderedComponent<LifecyclePageHost> Page(Func<CancellationToken, Task>? load = null)
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddSingleton<IPkLog>(new FakeLog());
        return Render<LifecyclePageHost>(p => p.Add(x => x.Key, 1).Add(x => x.Load, load));
    }

    [Fact]
    public void Loads_on_first_render_with_IsLoading_true_before_the_first_await()
    {
        var gate = new TaskCompletionSource();
        var cut = Page(_ => gate.Task);
        Assert.Contains("loading", cut.Markup);
        Assert.Equal(1, cut.Instance.Loads);
        gate.SetResult();
        cut.WaitForAssertion(() => Assert.Contains("ready", cut.Markup));
    }

    [Fact]
    public void Reloads_on_a_changed_parameter_only_and_cancels_the_previous_token()
    {
        Func<CancellationToken, Task> load = _ => Task.CompletedTask;
        var cut = Page(load);
        var first = cut.Instance.Tokens[0];
        cut.Render(p => p.Add(x => x.Key, 1).Add(x => x.Load, load));
        Assert.Equal(1, cut.Instance.Loads);
        cut.Render(p => p.Add(x => x.Key, 2).Add(x => x.Load, load));
        cut.WaitForAssertion(() => Assert.Equal(2, cut.Instance.Loads));
        Assert.True(first.IsCancellationRequested);
    }

    // ReloadParameters is read before the parameters are applied, so it is a constant of the page type.
    private sealed class KeyedHost : LifecyclePageHost { protected override IReadOnlyCollection<string>? ReloadParameters => new[] { "Key" }; }
    private sealed class OnceHost : LifecyclePageHost { protected override IReadOnlyCollection<string>? ReloadParameters => Array.Empty<string>(); }

    private IRenderedComponent<T> Host<T>() where T : LifecyclePageHost
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddSingleton<IPkLog>(new FakeLog());
        return Render<T>(p => p.Add(x => x.Key, 1).Add(x => x.Tab, "a"));
    }

    [Fact]
    public void ReloadParameters_names_the_parameters_that_mean_another_record()
    {
        var cut = Host<KeyedHost>();
        cut.Render(p => p.Add(x => x.Key, 1).Add(x => x.Tab, "b"));
        Assert.Equal(1, cut.Instance.Loads);
        cut.Render(p => p.Add(x => x.Key, 2).Add(x => x.Tab, "b"));
        cut.WaitForAssertion(() => Assert.Equal(2, cut.Instance.Loads));
    }

    [Fact]
    public void An_empty_ReloadParameters_loads_once()
    {
        var cut = Host<OnceHost>();
        cut.Render(p => p.Add(x => x.Key, 2).Add(x => x.Tab, "b"));
        Assert.Equal(1, cut.Instance.Loads);
    }

    [Fact]
    public async Task Dispose_cancels_the_load_and_a_state_change_afterwards_does_not_throw()
    {
        var gate = new TaskCompletionSource();
        var cut = Page(_ => gate.Task);
        var token = cut.Instance.Tokens[0];
        await ((IAsyncDisposable)cut.Instance).DisposeAsync();
        Assert.True(token.IsCancellationRequested);
        Assert.True(cut.Instance.Disposed);
        await cut.Instance.CallInvokeStateChanged();
        gate.SetResult();
    }

    [Fact]
    public void A_faulted_load_sets_LoadError()
    {
        var cut = Page(_ => throw new InvalidOperationException("boom"));
        cut.WaitForAssertion(() => Assert.Contains("error:boom", cut.Markup));
    }
}
