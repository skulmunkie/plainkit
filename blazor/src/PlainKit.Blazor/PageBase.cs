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
public abstract partial class PageBase : ComponentBase, IDisposable
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
    protected bool IsBusy => _busy.Count > 0;

    /// <summary>The label of the most recent busy action still running; once idle, the label of the last one (so a fading overlay keeps its text).</summary>
    protected string? BusyLabel => _busy.Count > 0 ? _busy[^1].Label : _lastLabel;

    /// <summary>The scope this page logs under: the SDK scope on the JavaScript side and the <c>PlainKit.&lt;scope&gt;</c> ILogger category. Override to name it; defaults to the page's own type name.</summary>
    protected virtual string LogScope => GetType().Name;

    /// <summary>Shows a status notice and re-renders.</summary>
    protected void SetStatus(string message, string kind = "info", string? heading = null)
    {
        StatusMessage = message;
        StatusKind = kind;
        StatusHeading = heading;
        StateHasChanged();
    }

    /// <summary>Clears the current status notice and re-renders.</summary>
    protected void ClearStatus()
    {
        StatusMessage = null;
        StatusHeading = null;
        StateHasChanged();
    }

    /// <summary>Logs the exception through <see cref="IPkLog"/> (its message and its <see cref="Exception.ToString"/> as detail) and shows the message as a danger status.</summary>
    protected async Task SetErrorAsync(Exception exception, string? message = null)
    {
        var text = message ?? exception.Message;
        await Log.WriteAsync(PkLogLevel.Error, LogScope, text, exception.ToString());
        SetStatus(text, "danger");
    }

    /// <summary>
    /// Takes a busy token and returns the handle that releases it (dispose it, once or many times). Use it for work that is not one awaited action:
    /// <c>using var busy = BeginBusy("Saving…");</c>. <see cref="BusyAsync(Func{Task},string?)"/> is this around an action.
    /// </summary>
    protected IDisposable BeginBusy(string? label = null)
    {
        var token = new BusyToken(label, this);
        _busy.Add(token);
        _lastLabel = label;
        StateHasChanged();
        return token;
    }

    /// <summary>
    /// Runs <paramref name="action"/> under a busy token (with an optional <paramref name="label"/>); the token is released in a finally, so overlapping calls never clear each other.
    /// An exception it throws is logged and shown as a danger status through <see cref="SetErrorAsync"/>, then rethrown so the caller's own handling (a form's own field errors,
    /// for instance) still runs.
    /// </summary>
    protected async Task BusyAsync(Func<Task> action, string? label = null)
    {
        using var busy = BeginBusy(label);
        try
        {
            await action();
        }
        catch (Exception exception)
        {
            await SetErrorAsync(exception);
            throw;
        }
    }

    /// <summary>The result-returning form of <see cref="BusyAsync(Func{Task},string?)"/>: the same counted busy, label and error handling around an action that produces a value.</summary>
    protected async Task<T> BusyAsync<T>(Func<Task<T>> action, string? label = null)
    {
        using var busy = BeginBusy(label);
        try
        {
            return await action();
        }
        catch (Exception exception)
        {
            await SetErrorAsync(exception);
            throw;
        }
    }

    /// <summary>Releases every busy token. Blazor does this when it disposes the page; a page that implements its own <c>Dispose</c> calls this from it.</summary>
    protected void ReleaseBusy()
    {
        _busy.Clear();
    }

    void IDisposable.Dispose() => ReleaseBusy();

    private readonly List<BusyToken> _busy = [];
    private string? _lastLabel;

    private sealed class BusyToken(string? label, PageBase page) : IDisposable
    {
        public string? Label { get; } = label;
        private PageBase? _page = page;

        public void Dispose()
        {
            var owner = _page;
            _page = null;
            if (owner is null) return;
            if (owner._busy.Remove(this) && owner._busy.Count > 0) owner._lastLabel = owner._busy[^1].Label;
            owner.StateHasChanged();
        }
    }
}
