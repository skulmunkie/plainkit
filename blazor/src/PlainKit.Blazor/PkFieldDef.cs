using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>One field of a <c>PkFieldGroup</c>, as the <c>pk-field-group</c> element reads it (<c>fields</c>). <c>PkFieldGroup&lt;TItem&gt;</c> builds these from typed <see cref="PkFieldSpec{TItem}"/> items.</summary>
public sealed partial record PkFieldDef
{
    /// <summary>Identifies the field: the key in <c>Values</c> and the name in the form.</summary>
    public required string Key { get; init; }
    /// <summary>The field label.</summary>
    public required string Label { get; init; }
    /// <summary>text, number, email, password, date, time, url, tel, textarea, select, checkbox, switch, range or combobox; text when unset.</summary>
    public string? Kind { get; init; }
    /// <summary>Help in a tooltip beside the label.</summary>
    public string? Help { get; init; }
    /// <summary>The control is read-only.</summary>
    public bool Readonly { get; init; }
    /// <summary>The control is disabled.</summary>
    public bool Disabled { get; init; }
    public string? MinLength { get; init; }
    /// <summary>The options of a select or combobox field.</summary>
    public IReadOnlyList<PkFieldOption>? Options { get; init; }
    /// <summary>Shows the field only while another field has this value; a hidden field is not rendered at all.</summary>
    public PkFieldWhen? When { get; init; }
    /// <summary>The validation message per constraint (required, pattern, ...): <c>data-msg-&lt;constraint&gt;</c> for pk-form.</summary>
    public IReadOnlyDictionary<string, string>? Msg { get; init; }
}

/// <summary>The condition of a field: the field with key <see cref="Field"/> equals one value, is one of several, or is not a value.</summary>
public sealed record PkFieldWhen
{
    /// <summary>The key of the field this one depends on.</summary>
    public required string Field { get; init; }
    /// <summary>Shown while the other field equals this.</summary>
    [JsonPropertyName("equals"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Equal { get; init; }
    /// <summary>Shown while the other field is one of these.</summary>
    [JsonPropertyName("in"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? In { get; init; }
    /// <summary>Shown while the other field is not this.</summary>
    [JsonPropertyName("not"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Not { get; init; }
}

/// <summary>What the element asks a <c>Search</c> callback: the field key and what the user typed.</summary>
public sealed record PkFieldSearch
{
    /// <summary>The key of the combobox field.</summary>
    public string Key { get; init; } = "";
    /// <summary>The text typed so far.</summary>
    public string Query { get; init; } = "";
}
