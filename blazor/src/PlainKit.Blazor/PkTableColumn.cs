using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>What a <see cref="PkTableColumn"/> holds; it decides how the element sorts and filters the column.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PkTableColumnType>))]
public enum PkTableColumnType
{
    /// <summary>Text, sorted alphabetically.</summary>
    [JsonStringEnumMemberName("text")] Text,
    /// <summary>A number, sorted numerically.</summary>
    [JsonStringEnumMemberName("number")] Number,
    /// <summary>A date, sorted chronologically.</summary>
    [JsonStringEnumMemberName("date")] Date,
}

/// <summary>Which edge a <see cref="PkTableColumn"/>'s cells align to.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PkTableColumnAlign>))]
public enum PkTableColumnAlign
{
    /// <summary>The start edge (left in left-to-right text); the default.</summary>
    [JsonStringEnumMemberName("start")] Start,
    /// <summary>The end edge; use it for numeric columns.</summary>
    [JsonStringEnumMemberName("end")] End,
}

/// <summary>The editor of an editable <c>PkTable</c> column (see <c>Editable</c>). A column without one is read-only.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PkTableEditor>))]
public enum PkTableEditor
{
    /// <summary>A text box.</summary>
    [JsonStringEnumMemberName("text")] Text,
    /// <summary>A text box that takes a number (checked with <c>Min</c> and <c>Max</c>).</summary>
    [JsonStringEnumMemberName("number")] Number,
    /// <summary>A choice among <c>Options</c>.</summary>
    [JsonStringEnumMemberName("select")] Select,
    /// <summary>An on/off switch that toggles at once.</summary>
    [JsonStringEnumMemberName("switch")] Switch,
}

/// <summary>A column of a <c>pk-table</c>.</summary>
/// <remarks>Sent to the element's <c>columns</c> attribute (JSON, camelCase): <c>{ "key", "label", "type", "align", "sortable", "hidePhone" }</c>.</remarks>
public sealed record PkTableColumn
{
    /// <summary>The field of a row that this column shows.</summary>
    public string Key { get; init; } = "";

    /// <summary>The header text.</summary>
    public string Label { get; init; } = "";

    /// <summary>What the column holds; null leaves it to the element (text).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PkTableColumnType? Type { get; init; }

    /// <summary>The alignment of the cells; null leaves it to the element (start).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PkTableColumnAlign? Align { get; init; }

    /// <summary>The header can be activated to sort by this column.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Sortable { get; init; }

    /// <summary>Leave the column out of the card layout on a phone.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool HidePhone { get; init; }

    /// <summary>The editor of the column's cells in an editable table; null leaves the column read-only.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public PkTableEditor? Editor { get; init; }

    /// <summary>The choices of a <see cref="PkTableEditor.Select"/> editor.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? Options { get; init; }

    /// <summary>An empty value is refused.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Required { get; init; }

    /// <summary>The smallest value of a <see cref="PkTableEditor.Number"/> editor.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Min { get; init; }

    /// <summary>The largest value of a <see cref="PkTableEditor.Number"/> editor.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Max { get; init; }

    /// <summary>The longest text a <see cref="PkTableEditor.Text"/> editor accepts.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? MaxLength { get; init; }
}
