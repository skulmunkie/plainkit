using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;

namespace PlainKit.Blazor;

// The toast helpers of PageBase (#855), over IPkNotifications (the SDK's one toast stack). Resolved on use, so a page that never calls them, and a test host without the
// service, cost nothing and never throw.
public abstract partial class PageBase
{
    [Inject] private IServiceProvider Services { get; set; } = default!;

    private IPkNotifications? Notifications => Services.GetService<IPkNotifications>();

    /// <summary>A success toast (a status, polite for a screen reader).</summary>
    protected ValueTask ShowSuccess(string title, string? details = null) => Notifications?.SuccessAsync(title, details) ?? ValueTask.CompletedTask;

    /// <summary>A warning toast.</summary>
    protected ValueTask ShowWarning(string title, string? details = null) => Notifications?.WarnAsync(title, details) ?? ValueTask.CompletedTask;

    /// <summary>An error toast, sticky until dismissed (an alert for a screen reader).</summary>
    protected ValueTask ShowError(string title, string? details = null) => Notifications?.ErrorAsync(title, details) ?? ValueTask.CompletedTask;

    /// <summary>
    /// Logs the exception and shows an error toast: the message of an <see cref="IPkUserFacingException"/> as it is, any other exception as a generic line (its text may
    /// not be written for the person using the app). <paramref name="title"/> defaults to "Could not complete".
    /// </summary>
    protected async ValueTask ShowError(Exception exception, string? title = null)
    {
        await Log.WriteAsync(PkLogLevel.Error, LogScope, title ?? exception.Message, exception.ToString());
        await ShowError(title ?? "Could not complete", exception is IPkUserFacingException ? exception.Message : "Something went wrong. See the log for details.");
    }
}
