using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>
/// Short messages as toasts in the bottom-end stack (the Blazor side of <c>ctx.notify</c>, js/notify.js). Info and success last 4 s, warn 8 s, error stays until
/// dismissed; <c>duration</c> overrides (zero = sticky). The same kind and title raised again within 2 s is merged, and at most five are kept. Text is shown as text.
/// Call from <c>OnAfterRenderAsync</c> or an event handler: nothing reaches JavaScript during prerendering, where a call does nothing (one logged warning).
/// </summary>
public interface IPkNotifications
{
    /// <summary>An informational toast.</summary>
    ValueTask InfoAsync(string title, string? details = null, TimeSpan? duration = null);
    /// <summary>A success toast.</summary>
    ValueTask SuccessAsync(string title, string? details = null, TimeSpan? duration = null);
    /// <summary>A warning toast.</summary>
    ValueTask WarnAsync(string title, string? details = null, TimeSpan? duration = null);
    /// <summary>An error toast (until dismissed, unless <paramref name="duration"/> is given).</summary>
    ValueTask ErrorAsync(string title, string? details = null, TimeSpan? duration = null);
}

/// <summary>
/// Promise-style modal dialogs over pk-dialog (the Blazor side of <c>ctx.dialogs</c>, js/dialogs.js). One dialog is open at a time and the rest queue; focus goes
/// into the dialog and back to the trigger; Escape and the close button cancel, the backdrop only with <see cref="PkDialogOptions.Backdrop"/>; a phone gets full
/// screen. Cancelled means <c>false</c> / <c>null</c>, and so is a dialog whose service is disposed (leaving the page). Not supported from C#: a template or a
/// validate callback (use required and max length). Call from an event handler or <c>OnAfterRenderAsync</c>; prerendering has no dialogs (cancelled, one warning).
/// </summary>
public interface IPkDialogs : IAsyncDisposable
{
    /// <summary>Asks yes or no: true when confirmed.</summary>
    ValueTask<bool> ConfirmAsync(PkDialogOptions options);
    /// <summary>Tells something; completes when dismissed.</summary>
    ValueTask AlertAsync(PkDialogOptions options);
    /// <summary>Asks for one line of text: the trimmed text, or null when cancelled.</summary>
    ValueTask<string?> PromptAsync(PkDialogOptions options);
    /// <summary>A form dialog from <see cref="PkDialogOptions.Fields"/> and <see cref="PkDialogOptions.Actions"/>; null when cancelled.</summary>
    ValueTask<PkDialogResult?> OpenAsync(PkDialogOptions options);
}

internal sealed class PkNotifications(PkRuntime runtime, IPkStorage log) : IPkNotifications
{
    public ValueTask InfoAsync(string title, string? details = null, TimeSpan? duration = null) => Show("info", title, details, duration);
    public ValueTask SuccessAsync(string title, string? details = null, TimeSpan? duration = null) => Show("success", title, details, duration);
    public ValueTask WarnAsync(string title, string? details = null, TimeSpan? duration = null) => Show("warn", title, details, duration);
    public ValueTask ErrorAsync(string title, string? details = null, TimeSpan? duration = null) => Show("error", title, details, duration);

    private async ValueTask Show(string kind, string title, string? details, TimeSpan? duration)
    {
        try { await (await runtime.BridgeAsync()).InvokeVoidAsync("notify", kind, title, details, duration is { } d ? Math.Max(0, d.TotalMilliseconds) : null); }
        catch (Exception e) when (PkStorage.Unavailable(e)) { log.Warn($"notification \"{title}\" was not shown ({e.GetType().Name})"); }
    }
}

internal sealed class PkDialogs(PkRuntime runtime, IPkStorage log) : IPkDialogs
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private readonly string _scope = Guid.NewGuid().ToString("N");

    public async ValueTask<bool> ConfirmAsync(PkDialogOptions options) => await Ask<bool?>("confirm", options) == true;
    public async ValueTask AlertAsync(PkDialogOptions options) => await Ask<object>("alert", options);
    public ValueTask<string?> PromptAsync(PkDialogOptions options) => Ask<string>("prompt", options);
    public ValueTask<PkDialogResult?> OpenAsync(PkDialogOptions options) => Ask<PkDialogResult>("open", options);

    private async ValueTask<T?> Ask<T>(string kind, PkDialogOptions options)
    {
        using var confirm = options.OnConfirm is { } run ? DotNetObjectReference.Create(new PkDialogConfirm(run)) : null; // the busy state and the retained error are core's (js/dialogs.js onConfirm)
        try { return await (await runtime.BridgeAsync()).InvokeAsync<T?>("dialog", _scope, kind, JsonSerializer.SerializeToElement(options, Json), confirm); }
        catch (Exception e) when (PkStorage.Unavailable(e)) { log.Warn($"a {kind} dialog was cancelled: it could not open ({e.GetType().Name})"); return default; }
    }

    public async ValueTask DisposeAsync()
    {
        try { await (await runtime.BridgeAsync()).InvokeVoidAsync("endDialogs", _scope); }
        catch (Exception e) when (PkStorage.Unavailable(e)) { /* the page is gone: its dialogs went with it */ }
    }
}

internal sealed class PkDialogConfirm(Func<Task<string?>> run)
{
    [JSInvokable] public Task<string?> Run() => run();
}
