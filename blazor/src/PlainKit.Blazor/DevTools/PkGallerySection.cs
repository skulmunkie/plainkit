using System.Text.Json;
using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>
/// A section a host adds to the gallery's Details drawer (the element inspector), as plain text data: the gallery runs in its own frame, so what crosses
/// is this description, sent as JSON in the <c>sections</c> attribute of <c>pk-gallery</c>. Text only: the gallery draws it with SDK components and
/// never parses markup. Values are cut to the SDK's limits (<c>js/gallery-sections.js</c>).
/// </summary>
public sealed record PkGallerySection
{
    /// <summary>The element it belongs to (<c>pk-button</c>); null shows the section for every element.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Tag { get; init; }

    /// <summary>The heading of the section.</summary>
    public string Title { get; init; } = "";

    /// <summary>Whether the section starts open.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Open { get; init; }

    /// <summary>Short paragraphs, above the table.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? Lines { get; init; }

    /// <summary>The header cells of the table (with <see cref="Rows"/>); null uses Name and Value.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? Columns { get; init; }

    /// <summary>The rows of the table, each a list of cells.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<IReadOnlyList<string>>? Rows { get; init; }

    /// <summary>One block of monospaced text with a copy button, for example Razor markup.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Code { get; init; }

    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private static readonly Lazy<IReadOnlyList<PkGallerySection>> Blazor = new(() =>
        [.. PkMappingInfo.Tags.Select(t => PkMappingInfo.Describe(t)).OfType<PkComponentInfo>().Select(FromComponent)]);

    /// <summary>The JSON the <c>sections</c> attribute carries.</summary>
    public static string ToJson(IReadOnlyList<PkGallerySection> sections) => JsonSerializer.Serialize(sections, Web);

    /// <summary>
    /// The Blazor section for every element that has a mapping, computed from <see cref="PkMappingInfo"/> (this package's mappings and the generator's
    /// manifest; the SDK holds no copy): the component and its status, its parameters, and the Razor for the bare component.
    /// </summary>
    public static IReadOnlyList<PkGallerySection> ForBlazor() => Blazor.Value;

    private static PkGallerySection FromComponent(PkComponentInfo c) => new()
    {
        Tag = c.Tag,
        Title = "Blazor",
        Open = true,
        Lines = [c.Note is null ? $"Component {c.Component} ({c.Status})." : $"Component {c.Component} ({c.Status}): {c.Note}"],
        Columns = ["Parameter", "Kind", "Type", "Drives"],
        Rows = c.Parameters.Count == 0 ? null : [.. c.Parameters.Select(p => (IReadOnlyList<string>)[p.Name, p.TwoWay ? p.Kind + " (@bind)" : p.Kind, p.Type, p.Attribute ?? ""])],
        Code = c.Status == "not available" ? null : c.Markup,
    };
}
