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
///   &lt;PkLoadingOverlay Busy="@IsBusy" Label="@BusyLabel"&gt;...&lt;/PkLoadingOverlay&gt;
///   @code {
///       protected override void OnInitialized() { Title = "Orders"; Crumbs = [new("Home", "/"), new("Orders")]; }
///       private Task LoadAsync() => BusyAsync(async () => Orders = await Client.GetOrdersAsync(), "Loading orders…");
///   }
/// </summary>
public abstract class PageBase : ComponentBase
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

    /// <summary>Whether a <see cref="BusyAsync(Func{Task},string?)"/> action is in flight.</summary>
    protected bool IsBusy { get; private set; }

    /// <summary>The label shown on the busy overlay while <see cref="IsBusy"/>.</summary>
    protected string? BusyLabel { get; private set; }

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
    /// Runs <paramref name="action"/> under <see cref="IsBusy"/> (with an optional <paramref name="label"/>). An exception it throws is
    /// logged and shown as a danger status through <see cref="SetErrorAsync"/>, then rethrown so the caller's own handling (a form's own
    /// field errors, for instance) still runs.
    /// </summary>
    protected async Task BusyAsync(Func<Task> action, string? label = null)
    {
        BusyLabel = label;
        IsBusy = true;
        StateHasChanged();
        try
        {
            await action();
        }
        catch (Exception exception)
        {
            await SetErrorAsync(exception);
            throw;
        }
        finally
        {
            IsBusy = false;
            StateHasChanged();
        }
    }

    /// <summary>The result-returning form of <see cref="BusyAsync(Func{Task},string?)"/>: the same busy flag, label and error handling around an action that produces a value.</summary>
    protected async Task<T> BusyAsync<T>(Func<Task<T>> action, string? label = null)
    {
        BusyLabel = label;
        IsBusy = true;
        StateHasChanged();
        try
        {
            return await action();
        }
        catch (Exception exception)
        {
            await SetErrorAsync(exception);
            throw;
        }
        finally
        {
            IsBusy = false;
            StateHasChanged();
        }
    }
}
