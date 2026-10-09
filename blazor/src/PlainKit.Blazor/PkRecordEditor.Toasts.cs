using Microsoft.Extensions.Logging;

namespace PlainKit.Blazor;

/// <summary>
/// The words of <see cref="PkRecordEditor{TRecord, TForm, TKey}"/>'s toasts (#855). Null keeps the neutral default (Saved, Deleted, Could not save or Could not delete); an
/// empty string shows no toast for that outcome.
/// </summary>
/// <param name="Saved">After a save.</param>
/// <param name="Deleted">After a delete.</param>
/// <param name="Failed">The title of the error toast after a failed save or delete (its details are the editor's <c>Error</c>).</param>
public sealed record PkRecordMessages(string? Saved = null, string? Deleted = null, string? Failed = null);

public sealed partial class PkRecordEditor<TRecord, TForm, TKey>
{
    /// <summary>
    /// Opt-in: with a notifier the editor toasts "Saved", "Deleted" and, after a failure, "Could not save" or "Could not delete" with <see cref="Error"/> as the details; without one
    /// (the default) it toasts nothing, as before. Validation problems stay inline and are never toasts.
    /// </summary>
    public IPkNotifications? Notify { get; init; }

    /// <summary>Words or silences the toasts (see <see cref="PkRecordMessages"/>).</summary>
    public PkRecordMessages Messages { get; init; } = new();

    private async Task<bool> ToastAsync(bool ok, bool saving)
    {
        if (Notify is null) return ok;
        try
        {
            var title = ok ? (saving ? Messages.Saved ?? "Saved" : Messages.Deleted ?? "Deleted") : Messages.Failed ?? (saving ? "Could not save" : "Could not delete");
            if (title.Length == 0) return ok;
            if (ok) await Notify.SuccessAsync(title); else await Notify.ErrorAsync(title, Error);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "The toast for {Noun} could not be shown", noun);
        }
        return ok;
    }
}
