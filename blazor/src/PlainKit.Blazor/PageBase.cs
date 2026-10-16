using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>
/// The page-level state a concrete page otherwise repeats by hand: a status/error notice, a busy flag wrapped around an action,
/// and a title and breadcrumb trail (<see cref="PkCrumb"/>, the same shape <see cref="PkPageHeader"/> already takes, so a page
/// binds <see cref="Title"/> and <see cref="Crumbs"/> straight into it). Errors go through <see cref="IPkLog"/>, so they land
/// beside the SDK's own log entries instead of a page inventing its own channel. This is the same small model <c>core/js/page.js</c>
/// gives a vanilla page (title, status, busy, breadcrumbs, logging built from elements already on the page) — a Blazor page
/// inherits from this instead of reimplementing it with private fields and try/catch at every call site.
///
///   @page "/orders"
///   @inherits PageBase
///   &lt;PkPageHeader Title="@Title" Crumbs="@Crumbs" /&gt;
///   @if (StatusMessage is not null) { &lt;PkAlert Kind="@StatusKind" Heading="@StatusHeading"&gt;@StatusMessage&lt;/PkAlert&gt; }
///   &lt;PkLoadingOverlay Busy="@IsBusy" Delay="150" MinTime="300" Label="@BusyLabel"&gt;...&lt;/PkLoadingOverlay&gt;
///   @code {
///       protected override void OnInitialized() { Title = "Orders"; Crumbs = [new("Home", "/"), new("Orders")]; }
///       private Task LoadAsync() => BusyAsync(async () => Orders = await Client.GetOrdersAsync(), "Loading orders…");
///   }
/// </summary>
public abstract partial class PageBase : ComponentBase, IAsyncDisposable
{
    /// <summary>Writes an error into the SDK log through <see cref="IPkLog"/> (used by <see cref="SetErrorAsync"/>).</summary>
    [Inject] protected IPkLog Log { get; set; } = default!;

    /// <summary>The page's title; bind into <see cref="PkPageHeader.Title"/> or the document title.</summary>
    protected string? Title { get; set; }

    /// <summary>The breadcrumb trail; the last crumb is the current page. Bind into <see cref="PkPageHeader.Crumbs"/>.</summary>
    protected IReadOnlyList<PkCrumb>? Crumbs { get; set; }

    /// <summary>The status message currently shown, or null when there is none.</summary>
    protected string? StatusMessage { get; private set; }

    /// <summary>The kind of the current status: info, success, warning or danger.</summary>
    protected string StatusKind { get; private set; } = "info";

    /// <summary>An optional heading for the current status.</summary>
    protected string? StatusHeading { get; private set; }

    /// <summary>Whether any busy action (<see cref="BusyAsync(Func{Task},string?)"/> or <see cref="BeginBusy"/>) is in flight. Busy is counted: overlapping actions each hold a token and this stays true until the last one ends.</summary>
    protected bool IsBusy => _life.IsBusy;

    /// <summary>The label of the most recent busy action still running; once idle, the label of the last one (so a fading overlay keeps its text).</summary>
    protected string? BusyLabel => _life.BusyLabel;

    /// <summary>The scope this page logs under: the SDK scope on the JavaScript side and the <c>PlainKit.&lt;scope&gt;</c> ILogger category. Override to name it; defaults to the page's own type name.</summary>
    protected virtual string LogScope => GetType().Name;

    /// <summary>Shows a status notice and re-renders.</summary>
    protected void SetStatus(string message, string kind = "info", string? heading = null)
    {
        (StatusMessage, StatusKind, StatusHeading) = (message, kind, heading);
        StateHasChanged();
    }

    /// <summary>Clears the current status notice and re-renders.</summary>
    protected void ClearStatus() { (StatusMessage, StatusHeading) = (null, null); StateHasChanged(); }

    /// <summary>Logs the exception through <see cref="IPkLog"/> (its message and its <see cref="Exception.ToString"/> as detail) and shows the message as a danger status.</summary>
    protected async Task SetErrorAsync(Exception exception, string? message = null)
    {
        var text = message ?? DescribeError(exception);
        await Log.WriteAsync(PkLogLevel.Error, LogScope, text, exception.ToString());
        SetStatus(text, "danger");
    }

    /// <summary>
    /// Takes a busy token and returns the handle that releases it (dispose it, once or many times) for work that is not one awaited action:
    /// <c>using var busy = BeginBusy("Saving…");</c>.
    /// </summary>
    protected IDisposable BeginBusy(string? label = null) => _life.Begin(label);

    /// <summary>Runs on the first render and again when a parameter changed (<see cref="ReloadOnParameters"/>). <see cref="IsLoading"/> is true from before the first render until it ends; a failure is logged, shown as a danger status and kept in <see cref="LoadError"/>; a cancelled load is silent.</summary>
    protected virtual Task OnLoadAsync(CancellationToken cancel) => Task.CompletedTask;

    /// <summary>Whether a changed parameter starts a new load (default true; the previous load's token is cancelled either way).</summary>
    protected virtual bool ReloadOnParameters => true;
    /// <summary>The parameters whose change means another record and starts a load; null (default) means any parameter, empty means load once. A <c>?tab=</c> parameter left out no longer reloads.</summary>
    protected virtual IReadOnlyCollection<string>? ReloadParameters => null;

    /// <summary>Cancelled when the next load starts and when the page is disposed; pass it to calls started outside <see cref="OnLoadAsync"/>.</summary>
    protected CancellationToken LoadCancellation => _life.Token;

    /// <summary>True from before the first render of a load until it ends.</summary>
    protected bool IsLoading => _life.State == "loading";

    /// <summary>The exception the last load failed with, or null.</summary>
    protected Exception? LoadError => _life.State == "error" ? _life.Error : null;

    /// <summary>Re-renders through the renderer's dispatcher; a no-op after the page is disposed.</summary>
    protected Task InvokeStateChanged() => _life.Disposed ? Task.CompletedTask : InvokeAsync(StateHasChanged);

    /// <summary>Runs when the page is disposed, after its loads are cancelled and its busy tokens released.</summary>
    protected virtual ValueTask OnDisposeAsync() => ValueTask.CompletedTask;

    /// <inheritdoc />
    public override async Task SetParametersAsync(ParameterView parameters)
    {
        var keys = ReloadParameters;
        var next = parameters.ToDictionary().Where(p => keys is null || keys.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value);
        var reload = ReloadOnParameters && (_parameters is null || next.Count != _parameters.Count || next.Any(p => !_parameters.TryGetValue(p.Key, out var old) || !Equals(old, p.Value)));
        _parameters = next; if (reload) _life.Expect();
        await base.SetParametersAsync(parameters); if (!reload) return;
        var load = _life.LoadAsync<object?>(async c => { await OnLoadAsync(c); return null; }, null, e => SetErrorAsync(e));
        if (load.IsCompleted) await InvokeStateChanged(); else _ = load.ContinueWith(_ => InvokeStateChanged(), TaskScheduler.Default);
    }

    /// <summary>Releases every busy token. Disposal does this; a page that disposes itself calls it directly.</summary>
    protected void ReleaseBusy() => _life.ReleaseBusy();

    async ValueTask IAsyncDisposable.DisposeAsync() { _life.Dispose(); await OnDisposeAsync(); }

    /// <summary>Creates the page lifecycle.</summary>
    protected PageBase() => _life = new PkLifecycle(() => { if (!_life!.Disposed) StateHasChanged(); });

    private readonly PkLifecycle _life;
    private IReadOnlyDictionary<string, object?>? _parameters;
}
