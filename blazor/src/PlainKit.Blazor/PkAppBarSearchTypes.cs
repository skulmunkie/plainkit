namespace PlainKit.Blazor;

/// <summary>A result of a <see cref="PkAppBarSearch"/>, as <see cref="PkAppBarSearch.Items"/> sends it. <c>OnSelect</c> carries the chosen one back
/// as JSON (<c>PkSelectEventArgs.Item</c>); deserialize it as this type to read it back.</summary>
public sealed record PkAppBarSearchItem
{
    /// <summary>Identifies the result; not shown.</summary>
    public string Id { get; init; } = "";
    /// <summary>The row's main text.</summary>
    public string Label { get; init; } = "";
    /// <summary>Adjacent results with the same group get one heading between them. The order of <see cref="PkAppBarSearch.Items"/> decides where a group's results sit; group them together.</summary>
    public string? Group { get; init; }
    /// <summary>A second line under the label.</summary>
    public string? Sub { get; init; }
    /// <summary>An image URL shown before the label.</summary>
    public string? Thumbnail { get; init; }
    /// <summary>Short text shown at the end of the row (a status, a count).</summary>
    public string? Badge { get; init; }
}
