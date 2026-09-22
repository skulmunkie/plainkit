using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>A theme of your own for <see cref="PkThemeEditor.Presets"/>: a name, and the theme as the editor's override block CSS or its JSON.</summary>
/// <param name="Name">1 to 40 characters: letters, digits, spaces and <c>_ . , ' ( ) -</c>. Must not be one of the built-in names (default, high-contrast, compact, roomy).</param>
/// <param name="Theme">The override block CSS (<c>:root, [data-theme="dark"] { ... }</c> and <c>[data-theme="light"] { ... }</c>) or the JSON <c>{ "shared": {}, "dark": {}, "light": {} }</c>. Names and values follow the SDK's override rules; anything else is dropped.</param>
/// <param name="Description">One line shown under the preset picker.</param>
public sealed record PkThemePreset(string Name, string Theme, string? Description = null);

/// <summary>What the theme editor calls back into: one per <see cref="PkThemeEditor"/> that has an <see cref="PkThemeEditor.OnThemeChanged"/> handler.</summary>
internal sealed class PkThemeEditorHost(Func<string, Task> onChange)
{
    /// <summary>The exported CSS after a change.</summary>
    [JSInvokable]
    public Task OnChange(string css) => onChange(css);
}
