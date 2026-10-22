using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>A field of <see cref="IPkDialogs.OpenAsync"/>. <see cref="Type"/> is one of email, url, tel, number, password, date, checkbox (its value comes back as "true" or "false"), else text.</summary>
public sealed record PkDialogField(string Name, string? Label = null, string? Value = null, string? Type = null, string? Placeholder = null, string? Help = null, bool Required = false, int MaxLength = 0);

/// <summary>A button of <see cref="IPkDialogs.OpenAsync"/>; <see cref="Value"/> is what comes back as the chosen action. <see cref="Variant"/> is a pk-button variant (default primary).</summary>
public sealed record PkDialogAction(string Label, string Value = "ok", string? Variant = null);

/// <summary>What a dialog shows and how it closes. Only the members its kind uses matter (see <see cref="IPkDialogs"/>).</summary>
public sealed partial record PkDialogOptions
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
    /// <summary>Confirm, prompt and open: runs when the confirming button is pressed, while the dialog stays open with that button busy. Return null to close, or a message to keep it open and show it in the dialog (cancel or retry).</summary>
    [JsonIgnore] public Func<Task<string?>>? OnConfirm { get; init; }
    /// <summary>Open: buttons after Cancel.</summary>
    public IReadOnlyList<PkDialogAction>? Actions { get; init; }
}

/// <summary>The answer of <see cref="IPkDialogs.OpenAsync"/>: the chosen action's value and the trimmed field values by name.</summary>
public sealed record PkDialogResult(string Action, IReadOnlyDictionary<string, string> Values);
