using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

public sealed partial record PkDialogOptions
{
    /// <summary>A tinted card: <c>product</c> (green wash) or <c>archived</c> (red wash).</summary>
    public string? Tint { get; init; }
    /// <summary>Card width in pixels before the viewport clamp (0 keeps <see cref="Size"/>).</summary>
    [JsonPropertyName("maxWidth")] public int MaxWidthPx { get; init; }
}
