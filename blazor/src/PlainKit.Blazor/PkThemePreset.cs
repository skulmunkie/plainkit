namespace PlainKit.Blazor;

/// <summary>A theme of your own for <see cref="PkThemeEditor.Presets"/>: a name, and the theme as the editor's override block CSS or its JSON.</summary>
/// <param name="Name">1 to 40 characters: letters, digits, spaces and <c>_ . , ' ( ) -</c>. Must not be one of the built-in names (default, high-contrast, compact, roomy).</param>
/// <param name="Theme">The override block CSS (<c>:root, [data-theme="dark"] { ... }</c> and <c>[data-theme="light"] { ... }</c>) or the JSON <c>{ "shared": {}, "dark": {}, "light": {} }</c>. Names and values follow the SDK's override rules; anything else is dropped.</param>
/// <param name="Description">One line shown under the preset picker.</param>
public sealed record PkThemePreset(string Name, string Theme, string? Description = null);

/// <summary>A custom SDK the theme editor exported (Custom SDK tab): the zip's file name and its bytes, to save wherever the app keeps files.</summary>
public sealed record PkThemeBundle(string Name, byte[] Zip);

/// <summary>What the theme editor calls back into: one per <see cref="PkThemeEditor"/> that has a handler. OnChange gets the CSS, OnBundle the zip.</summary>
internal sealed class PkThemeEditorHost(Func<string, Task> onChange, Func<PkThemeBundle, Task> onBundle)
{
    [Microsoft.JSInterop.JSInvokable] public Task OnChange(string css) => onChange(css);
    [Microsoft.JSInterop.JSInvokable] public Task OnBundle(string name, byte[] zip) => onBundle(new PkThemeBundle(name, zip));
}
