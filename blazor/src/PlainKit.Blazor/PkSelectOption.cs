using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>One option of a <c>PkSelect</c>'s <c>Options</c> data list.</summary>
/// <remarks>Sent as part of the element's <c>options</c> attribute (JSON, camelCase): <c>{ "value", "label", "disabled" }</c>. To group options,
/// build the <c>options</c> attribute by hand (<c>[{ "group", "options": [...] }]</c>); the typed <c>Options</c> parameter covers the flat shape.</remarks>
public sealed record PkSelectOption
{
    /// <summary>The value the form submits when this option is chosen.</summary>
    public string Value { get; init; } = "";

    /// <summary>The visible text; null leaves it to the element (the value).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Label { get; init; }

    /// <summary>The option cannot be chosen.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Disabled { get; init; }
}
