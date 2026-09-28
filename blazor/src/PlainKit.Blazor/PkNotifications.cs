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

/// <summary>A field of <see cref="IPkDialogs.OpenAsync"/>. <see cref="Type"/> is one of email, url, tel, number, password, date (else text).</summary>
public sealed record PkDialogField(string Name, string? Label = null, string? Value = null, string? Type = null, string? Placeholder = null, string? Help = null, bool Required = false, int MaxLength = 0);

/// <summary>A button of <see cref="IPkDialogs.OpenAsync"/>; <see cref="Value"/> is what comes back as the chosen action. <see cref="Variant"/> is a pk-button variant (default primary).</summary>
public sealed record PkDialogAction(string Label, string Value = "ok", string? Variant = null);

/// <summary>What a dialog shows and how it closes. Only the members its kind uses matter (see <see cref="IPkDialogs"/>).</summary>
public sealed record PkDialogOptions
{
    /// <summary>The title.</summary>
    public string? Heading { get; init; }
    /// <summary>A line of text under it (plain text, never markup).</summary>
    public string? Message { get; init; }
    /// <summary>The confirming button's text (Confirm for a confirm, else OK).</summary>
    public string? ConfirmLabel { get; init; }
    /// <summary>The cancelling button's text.</summary>
    public string? CancelLabel { get; init; }
    /// <summary>Styles the confirming button as destructive and focuses Cancel first.</summary>
    public bool Danger { get; init; }
    /// <summary>Only a button closes it: Escape and the close button are off.</summary>
    public bool Blocking { get; init; }
    /// <summary>Clicking the backdrop cancels (off by default).</summary>
    public bool Backdrop { get; init; }
    /// <summary><c>sm</c> (default), <c>md</c> or <c>lg</c>.</summary>
    public string? Size { get; init; }
    /// <summary>Prompt: the field's label.</summary>
    public string? Label { get; init; }
    /// <summary>Prompt: the starting text.</summary>
    public string? Value { get; init; }
    /// <summary>Prompt: placeholder text.</summary>
    public string? Placeholder { get; init; }
    /// <summary>Prompt: an empty answer is refused.</summary>
    public bool Required { get; init; }
    /// <summary>Prompt: longest answer (0 = no limit).</summary>
    public int MaxLength { get; init; }
    /// <summary>Open: the form fields.</summary>
    public IReadOnlyList<PkDialogField>? Fields { get; init; }
    /// <summary>Open: buttons after Cancel.</summary>
    public IReadOnlyList<PkDialogAction>? Actions { get; init; }
}

/// <summary>The answer of <see cref="IPkDialogs.OpenAsync"/>: the chosen action's value and the trimmed field values by name.</summary>
public sealed record PkDialogResult(string Action, IReadOnlyDictionary<string, string> Values);

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
        try { return await (await runtime.BridgeAsync()).InvokeAsync<T?>("dialog", _scope, kind, JsonSerializer.SerializeToElement(options, Json)); }
        catch (Exception e) when (PkStorage.Unavailable(e)) { log.Warn($"a {kind} dialog was cancelled: it could not open ({e.GetType().Name})"); return default; }
    }

    public async ValueTask DisposeAsync()
    {
        try { await (await runtime.BridgeAsync()).InvokeVoidAsync("endDialogs", _scope); }
        catch (Exception e) when (PkStorage.Unavailable(e)) { /* the page is gone: its dialogs went with it */ }
    }
}
