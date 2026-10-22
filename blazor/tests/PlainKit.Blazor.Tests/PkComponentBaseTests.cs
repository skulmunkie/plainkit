using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1022, step 3: PkComponentBase and PkRecordEditor on PkLifecycle (the shared rules are in PkLifecycleTests, from page-lifecycle.json).
public sealed class PkComponentBaseTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private BunitJSModuleInterop Bridge()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddScoped<IPkStorage>(_ => new NoStorage());
        return bridge;
    }

    private sealed class NoStorage : IPkStorage
    {
        public ValueTask<string?> GetAsync(string key) => ValueTask.FromResult<string?>(null);
        public ValueTask SetAsync(string key, string value) => ValueTask.CompletedTask;
        public void Warn(string message) { }
    }

    private IRenderedComponent<ComponentBaseHost> Card(Func<CancellationToken, Task>? load = null) =>
        Render<ComponentBaseHost>(p => p.Add(x => x.Key, 1).Add(x => x.Load, load));

    [Fact]
    public void Loads_with_IsLoading_true_first_and_a_faulted_load_sets_LoadError()
    {
        var gate = new TaskCompletionSource();
        var cut = Card(_ => gate.Task);
        Assert.Contains("loading", cut.Markup);
        gate.SetException(new InvalidOperationException("boom"));
        cut.WaitForAssertion(() => Assert.Contains("error:boom", cut.Markup));
    }

    private sealed class FakeLog : IPkLog
    {
        public readonly List<(PkLogLevel Level, string Scope, string Message, string? Detail)> Entries = [];
        public ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null) { Entries.Add((level, scope, message, detail)); return ValueTask.CompletedTask; }
        public ValueTask SetLevelAsync(PkLogLevel level) => ValueTask.CompletedTask;
        public ValueTask ConfigureAsync(PkLoggingOptions settings) => ValueTask.CompletedTask;
    }

    // Issue 1728: a failed load is logged under LogScope like PageBase does, a cancelled one is not.
    [Fact]
    public void A_failed_load_is_logged_through_IPkLog_under_the_LogScope_and_a_cancelled_one_is_not()
    {
        Bridge(); var log = new FakeLog(); Services.AddSingleton<IPkLog>(log);
        var cut = Render<ComponentBaseKeyHost>(p => p.Add(x => x.Key, -1));
        cut.WaitForAssertion(() => Assert.Equal(1, cut.Instance.Loads));
        var entry = Assert.Single(log.Entries);
        Assert.Equal((PkLogLevel.Error, "Card", "store offline"), (entry.Level, entry.Scope, entry.Message));
        Assert.Contains("InvalidOperationException", entry.Detail);

        var gone = Card(_ => throw new OperationCanceledException());
        gone.WaitForAssertion(() => Assert.Equal(1, gone.Instance.Loads));
        Assert.Single(log.Entries);
    }

    // Issue 1728: ReloadParameters names the parameters whose change starts a load, as on PageBase.
    [Fact]
    public void ReloadParameters_limits_which_changed_parameters_start_another_load()
    {
        Bridge();
        var cut = Render<ComponentBaseKeyHost>(p => p.Add(x => x.Key, 1).Add(x => x.Label, "a"));
        cut.Render(p => p.Add(x => x.Key, 1).Add(x => x.Label, "b"));
        Assert.Equal(1, cut.Instance.Loads);
        Assert.Contains("b", cut.Markup);
        cut.Render(p => p.Add(x => x.Key, 2).Add(x => x.Label, "b"));
        cut.WaitForAssertion(() => Assert.Equal(2, cut.Instance.Loads));
    }

    [Fact]
    public void A_changed_parameter_reloads_and_cancels_the_previous_token()
    {
        Func<CancellationToken, Task> load = _ => Task.CompletedTask;
        var cut = Card(load);
        var first = cut.Instance.Tokens[0];
        cut.Render(p => p.Add(x => x.Key, 2).Add(x => x.Load, load));
        cut.WaitForAssertion(() => Assert.Equal(2, cut.Instance.Loads));
        Assert.True(first.IsCancellationRequested);
    }

    [Fact]
    public async Task RunAsync_is_busy_while_running_and_dispose_cancels_it_silently()
    {
        var cut = Card();
        var gate = new TaskCompletionSource<string>();
        CancellationToken seen = default;
        var run = cut.InvokeAsync(() => cut.Instance.Run(c => { seen = c; return gate.Task; }));
        cut.WaitForAssertion(() => Assert.Contains("busy:Saving", cut.Markup));
        await ((IAsyncDisposable)cut.Instance).DisposeAsync();
        Assert.True(seen.IsCancellationRequested);
        gate.SetCanceled();
        Assert.Null(await run);
        await cut.Instance.CallInvokeStateChanged();
    }

    [Fact]
    public async Task RunAsync_rethrows_a_failure_and_releases_busy()
    {
        var cut = Card();
        await Assert.ThrowsAsync<InvalidOperationException>(() => cut.InvokeAsync(() => cut.Instance.Run(_ => throw new InvalidOperationException("no"))));
        Assert.DoesNotContain("busy", cut.Markup);
    }

    [Fact]
    public async Task RunEveryAsync_starts_the_core_timer_runs_the_tick_and_rerenders_and_disposal_stops_it()
    {
        var bridge = Bridge();
        var cut = Card();
        var handle = await cut.Instance.Every(TimeSpan.FromSeconds(1));
        var start = Assert.Single(bridge.Invocations, i => i.Identifier == "startTick");
        Assert.Equal(1000.0, start.Arguments[1]);
        var target = (Microsoft.JSInterop.DotNetObjectReference<PkTickTarget>)start.Arguments[0]!;
        await cut.InvokeAsync(() => target.Value.Tick());
        Assert.Equal(1, cut.Instance.Ticks);
        await handle.DisposeAsync();
        Assert.Contains(bridge.Invocations, i => i.Identifier == "stopTick");
        await ((IAsyncDisposable)cut.Instance).DisposeAsync();
        await target.Value.Tick();
        Assert.Equal(1, cut.Instance.Ticks);
    }

    [Fact]
    public async Task Disposing_the_component_stops_a_running_tick()
    {
        var bridge = Bridge();
        var cut = Card();
        await cut.Instance.Every(TimeSpan.FromSeconds(1));
        await ((IAsyncDisposable)cut.Instance).DisposeAsync();
        Assert.Contains(bridge.Invocations, i => i.Identifier == "stopTick");
    }

    private sealed class Row;
    private sealed class Form;

    [Fact]
    public async Task RecordEditor_is_busy_during_save_and_refuses_a_second_save()
    {
        var gate = new TaskCompletionSource();
        var saves = 0;
        var editor = new PkRecordEditor<Row, Form, int>(NullLogger.Instance, "row", _ => Task.FromResult<Row?>(new Row()), _ => new Form(), (_, _) => { saves++; return gate.Task; });
        editor.StartNew();
        var first = editor.SaveAsync();
        Assert.True(editor.Busy);
        Assert.False(await editor.SaveAsync());
        gate.SetResult();
        Assert.True(await first);
        Assert.False(editor.Busy);
        Assert.Equal(1, saves);
    }

    [Fact]
    public async Task RecordEditor_applies_only_the_latest_load_and_rethrows_a_load_failure()
    {
        var gates = new Dictionary<int, TaskCompletionSource<Row?>> { [1] = new(), [2] = new() };
        var editor = new PkRecordEditor<Row, Form, int>(NullLogger.Instance, "row", id => gates[id].Task, _ => new Form(), (_, _) => Task.CompletedTask);
        var stale = editor.LoadAsync(1);
        var latest = editor.LoadAsync(2);
        var row = new Row();
        gates[2].SetResult(row);
        gates[1].SetResult(new Row());
        await Task.WhenAll(stale, latest);
        Assert.Same(row, editor.Record);

        var bad = new PkRecordEditor<Row, Form, int>(NullLogger.Instance, "row", _ => throw new InvalidOperationException("down"), _ => new Form(), (_, _) => Task.CompletedTask);
        await Assert.ThrowsAsync<InvalidOperationException>(() => bad.LoadAsync(1));
    }
}
