using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>One image of a <c>PkImageGallery</c>.</summary>
/// <remarks>Sent to <c>pk-image-gallery</c> in its <c>images</c> attribute (JSON, camelCase). The element only shows same-site paths, http(s) URLs and raster data URLs.</remarks>
public sealed record PkGalleryImage
{
    /// <summary>The address of the image.</summary>
    public string Src { get; init; } = "";

    /// <summary>The text alternative of the image.</summary>
    public string Alt { get; init; } = "";

    /// <summary>Marks this image as the primary one when <c>PkImageGallery.Primary</c> is -1.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Primary { get; init; }

    /// <summary>A short warning badge shown on the image, such as <c>Staged</c>.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Status { get; init; }
}
