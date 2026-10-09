namespace PlainKit.Blazor;

/// <summary>A data-driven row of a <see cref="PkFieldList"/>, as <see cref="PkFieldList.Items"/> sends it (issue 527). <see cref="Value"/> is
/// text only, rendered as <c>textContent</c>, never parsed as markup; a rich value still uses <see cref="PkFieldList.ChildContent"/> with raw <c>dt</c>/<c>dd</c>.</summary>
public sealed record PkFieldListItem
{
    /// <summary>The term (the row's <c>dt</c>).</summary>
    public string Label { get; init; } = "";
    /// <summary>The value as plain text.</summary>
    public string? Value { get; init; }
    /// <summary>Hides the row outright, whatever <see cref="Value"/> is.</summary>
    public bool? Hidden { get; init; }
    /// <summary>Renders <see cref="Value"/> as a link to this address.</summary>
    public string? Href { get; init; }
}
