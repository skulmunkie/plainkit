namespace PlainKit.Blazor;

/// <summary>
/// A host-defined pattern for the code explorer's pattern report (<see cref="PkCodeExplorer.Patterns"/>): counts matches per
/// file and ranks files by count, e.g. "markup that a component already covers" or "calls to an API being retired".
/// </summary>
public sealed class PkCodePattern
{
    /// <summary>Shown next to each matching row.</summary>
    public required string Name { get; init; }

    /// <summary>A literal substring, or <c>/source/flags</c> for a regular expression (the same convention the explorer's own
    /// search box uses), matched against each line.</summary>
    public required string Pattern { get; init; }

    /// <summary>Shown alongside <see cref="Name"/>, e.g. the replacement to use.</summary>
    public string? Label { get; init; }
}
