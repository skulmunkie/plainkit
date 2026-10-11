using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>
/// The load, cancel and dispose rules (#1022) for a component that is not a page (a card, a panel, a picker): <see cref="PageBase"/>'s lifecycle without its title, crumbs and status.
/// Write markup plus <see cref="OnLoadAsync"/>; do not keep a <c>CancellationTokenSource</c>, an <c>IDisposable</c> or a busy flag of your own.
///
///   @inherits PkComponentBase
///   @if (IsLoading) { &lt;PkSpinner /&gt; } else if (LoadError is not null) { &lt;PkAlert Kind="danger"&gt;@LoadError.Message&lt;/PkAlert&gt; } else { ... }
///   &lt;PkButton Disabled="@IsBusy" @onpk-click="Save"&gt;Save&lt;/PkButton&gt;
///   @code { protected override async Task OnLoadAsync(CancellationToken cancel) =&gt; Rows = await Client.GetAsync(cancel); Task Save() =&gt; RunAsync(c =&gt; Client.SaveAsync(Rows, c), "Saving…"); }
/// </summary>
public abstract class PkComponentBase : ComponentBase, IAsyncDisposable
{
    private readonly PkLifecycle _life;
    private IReadOnlyDictionary<string, object?>? _parameters;

    /// <summary>Creates the lifecycle.</summary>
    protected PkComponentBase() => _life = new PkLifecycle(() => { if (!_life!.Disposed) StateHasChanged(); });

    /// <summary>Runs on the first render and again when a parameter changed (<see cref="ReloadOnParameters"/>); a failure is kept in <see cref="LoadError"/> and a cancelled load is silent.</summary>
    protected virtual Task OnLoadAsync(CancellationToken cancel) => Task.CompletedTask;

    /// <summary>Whether a changed parameter starts a new load (default true; the previous load's token is cancelled either way).</summary>
    protected virtual bool ReloadOnParameters => true;

    /// <summary>Cancelled when the next load starts and when the component is disposed.</summary>
    protected CancellationToken LoadCancellation => _life.Token;

    /// <summary>True from before the first render of a load until it ends.</summary>
    protected bool IsLoading => _life.State == "loading";

    /// <summary>The exception the last load failed with, or null.</summary>
    protected Exception? LoadError => _life.State == "error" ? _life.Error : null;

    /// <summary>Whether any <see cref="RunAsync{T}"/> action is in flight (counted, so overlapping actions never clear each other).</summary>
    protected bool IsBusy => _life.IsBusy;

    /// <summary>The label of the most recent running action, or of the last one once idle.</summary>
    protected string? BusyLabel => _life.BusyLabel;

    /// <summary>Runs <paramref name="action"/> under a busy token. A failure is rethrown to the caller; disposal cancels it silently (returns default).</summary>
    protected Task<T?> RunAsync<T>(Func<CancellationToken, Task<T>> action, string? label = null) => _life.RunAsync(label, action);

    /// <summary>The void form of <see cref="RunAsync{T}"/>.</summary>
    protected Task RunAsync(Func<CancellationToken, Task> action, string? label = null) => _life.RunAsync<object?>(label, async c => { await action(c); return null; });

    /// <summary>Re-renders through the renderer's dispatcher; a no-op after disposal.</summary>
    protected Task InvokeStateChanged() => _life.Disposed ? Task.CompletedTask : InvokeAsync(StateHasChanged);

    /// <summary>Runs when the component is disposed, after its loads are cancelled and its busy tokens released.</summary>
    protected virtual ValueTask OnDisposeAsync() => ValueTask.CompletedTask;

    /// <inheritdoc />
    public override async Task SetParametersAsync(ParameterView parameters)
    {
        var next = parameters.ToDictionary();
        var reload = ReloadOnParameters && (_parameters is null || next.Count != _parameters.Count || next.Any(p => !_parameters.TryGetValue(p.Key, out var old) || !Equals(old, p.Value)));
        _parameters = next;
        if (reload) _life.Expect();
        await base.SetParametersAsync(parameters);
        if (!reload) return;
        var load = _life.LoadAsync<object?>(async c => { await OnLoadAsync(c); return null; });
        if (!load.IsCompleted) _ = load.ContinueWith(_ => InvokeStateChanged(), TaskScheduler.Default);
    }

    async ValueTask IAsyncDisposable.DisposeAsync()
    {
        _life.Dispose();
        await OnDisposeAsync();
    }
}
