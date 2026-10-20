using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

public abstract partial class PkComponentBase
{
    [Inject] private IServiceProvider TickServices { get; set; } = null!; // resolved on first use: a component that never ticks needs nothing registered
    private readonly List<IAsyncDisposable> _ticks = [];

    /// <summary>
    /// Calls <paramref name="tick"/> every <paramref name="period"/> (the next one is timed from the end of the last, so a slow tick never overlaps itself) and re-renders after each. The timer is core's (js/tick.js), so
    /// nothing is kept here: it stops when the component is disposed or the returned handle is. The token is <see cref="LoadCancellation"/>. A tick that throws is logged and the next still runs; before the first render
    /// (prerendering) nothing runs, one warning is logged and the handle does nothing. Start it from <c>OnAfterRenderAsync(firstRender)</c> or an event handler.
    /// </summary>
    protected async ValueTask<IAsyncDisposable> RunEveryAsync(TimeSpan period, Func<CancellationToken, Task> tick)
    {
        var target = new PkTickTarget(async () => { if (_life.Disposed) return; await tick(LoadCancellation); await InvokeStateChanged(); });
        try
        {
            var bridge = await TickServices.GetRequiredService<PkRuntime>().BridgeAsync();
            var id = await bridge.InvokeAsync<int>("startTick", DotNetObjectReference.Create(target), Math.Max(1, period.TotalMilliseconds));
            var handle = new PkTickHandle(async () => { _ticks.RemoveAll(h => h is PkTickHandle { Id: var i } && i == id); try { await bridge.InvokeVoidAsync("stopTick", id); } catch (Exception e) when (PkStorage.Unavailable(e)) { /* the page is gone: its timers went with it */ } }, id);
            _ticks.Add(handle);
            return handle;
        }
        catch (Exception e) when (PkStorage.Unavailable(e))
        {
            TickServices.GetRequiredService<IPkStorage>().Warn($"RunEveryAsync did not start: the page is not ready for JavaScript ({e.GetType().Name})");
            return new PkTickHandle(() => ValueTask.CompletedTask, 0);
        }
    }

    private async ValueTask StopTicksAsync()
    {
        foreach (var h in _ticks.ToArray()) await h.DisposeAsync();
    }
}

internal sealed class PkTickTarget(Func<Task> run)
{
    [JSInvokable] public Task Tick() => run();
}

internal sealed class PkTickHandle(Func<ValueTask> stop, int id) : IAsyncDisposable
{
    public int Id { get; } = id;
    public ValueTask DisposeAsync() => stop();
}
