using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

public sealed partial record PkDialogOptions
{
    /// <summary><see cref="OnConfirm"/> with the answer: runs when the confirming button is pressed, with the trimmed field values by name (a prompt's text is <c>Values["value"]</c>; a checkbox is "true" or "false") and the pressed button's value in <see cref="PkDialogResult.Action"/>. The dialog stays open with that button busy; return null to close, or a message to keep it open with what was typed intact (retry or cancel). Wins over <see cref="OnConfirm"/> when both are set. <see cref="IPkDialogs.PromptAsync"/> and <see cref="IPkDialogs.OpenAsync"/> still return their answer after it closes.</summary>
    [JsonIgnore] public Func<PkDialogResult, Task<string?>>? OnConfirmValues { get; init; }
}
