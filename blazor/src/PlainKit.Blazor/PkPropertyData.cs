using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>One command of a <c>PkCommandPalette</c> (its <c>Items</c>).</summary>
/// <remarks>Sent to <c>pk-command-palette</c> as its <c>items</c> property (JSON, camelCase).</remarks>
public sealed record PkCommandPaletteItem
{
    /// <summary>The id the <c>OnSelect</c> callback reports.</summary>
    public string Id { get; init; } = "";

    /// <summary>The text of the row.</summary>
    public string Label { get; init; } = "";

    /// <summary>The heading the row is listed under; adjacent items with the same group share it.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Group { get; init; }

    /// <summary>Secondary text at the end of the row.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Hint { get; init; }

    /// <summary>Extra words the search matches besides the label.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Keywords { get; init; }

    /// <summary>A same-site address the palette navigates to when the row is chosen.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Href { get; init; }

    /// <summary>The shortcut shown at the end of the row (text only; it is not bound).</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Shortcut { get; init; }
}

/// <summary>One image of a <c>PkLightbox</c> (its <c>Items</c>).</summary>
/// <remarks>Sent to <c>pk-lightbox</c> as its <c>items</c> property (JSON, camelCase).</remarks>
public sealed record PkLightboxItem
{
    /// <summary>The address of the image.</summary>
    public string Src { get; init; } = "";

    /// <summary>The text alternative of the image.</summary>
    public string Alt { get; init; } = "";

    /// <summary>The caption shown under the image.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Caption { get; init; }
}

/// <summary>A coloured run of one line of a <c>PkCodeView</c> (its <c>Segments</c>).</summary>
/// <remarks>Sent to <c>pk-code-view</c> as its <c>segments</c> property (JSON, camelCase). The segments of a line should join to the line's text.</remarks>
public sealed record PkCodeSegment
{
    /// <summary>The text of the run.</summary>
    public string Text { get; init; } = "";

    /// <summary>The syntax kind: keyword, string, comment, number, type, tag, attribute, directive, key or plain.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Kind { get; init; }

    /// <summary>Marks a search hit.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public bool Match { get; init; }

    /// <summary>Marks the selected word.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public bool Word { get; init; }
}
