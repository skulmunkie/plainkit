using Bunit;
using Microsoft.Extensions.Logging.Abstractions;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1022, step 3: PkComponentBase and PkRecordEditor on PkLifecycle (the shared rules are in PkLifecycleTests, from page-lifecycle.json).
public sealed class PkComponentBaseTests : BunitContext
{
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
