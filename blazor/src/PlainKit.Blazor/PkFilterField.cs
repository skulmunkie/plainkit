using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>One option of a select or multiselect <see cref="PkFilterField"/>.</summary>
public sealed record PkFilterOption(string Value, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null);

/// <summary>A filter field beside the search box of a <c>PkDataTable</c> or <c>PkLookupPicker</c>; its value reaches <c>Load</c> in <see cref="PkListRequest.Filters"/> (or <c>MultiFilters</c>) under <see cref="Key"/>. <see cref="Type"/> is a pk-input type, <c>select</c> or <c>multiselect</c>.</summary>
public sealed record PkFilterField(
    string Key,
    string Label,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Type = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<PkFilterOption>? Options = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? AnyLabel = null);
