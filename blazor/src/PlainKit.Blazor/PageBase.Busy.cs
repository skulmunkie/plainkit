namespace PlainKit.Blazor;

public abstract partial class PageBase
{
    /// <summary>The text shown as the danger status (and logged as the message) when a busy action or a load fails. Default: the exception's own message; override to walk inner exceptions when the outer message is unhelpful.</summary>
    protected virtual string DescribeError(Exception exception) => exception.Message;

    /// <summary>
    /// Runs <paramref name="action"/> under a busy token (with an optional <paramref name="label"/>); overlapping calls never clear each other.
    /// An exception it throws is logged and shown as a danger status through <see cref="SetErrorAsync"/>, then rethrown so the caller's own handling still runs.
    /// </summary>
    protected Task BusyAsync(Func<Task> action, string? label = null) => _life.RunAsync<object?>(label, async _ => { await action(); return null; }, e => SetErrorAsync(e));

    /// <summary>The result-returning form of <see cref="BusyAsync(Func{Task},string?)"/>.</summary>
    protected async Task<T> BusyAsync<T>(Func<Task<T>> action, string? label = null) => (await _life.RunAsync(label, _ => action(), e => SetErrorAsync(e)))!;

    /// <summary>
    /// <see cref="BusyAsync(Func{Task},string?)"/> for an event handler: the same busy token, log and danger status, but a failure does not escape (an exception out of a handler is an unhandled circuit error).
    /// Returns true when the action succeeded, false when it failed (already logged and shown).
    /// </summary>
    protected async Task<bool> TryBusyAsync(Func<Task> action, string? label = null)
    {
        try
        {
            await BusyAsync(action, label);
            return true;
        }
        catch (Exception)
        {
            return false; // BusyAsync has already logged it and set the danger status
        }
    }
}
