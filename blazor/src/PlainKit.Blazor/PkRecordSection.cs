using System.Text.Json.Nodes;

namespace PlainKit.Blazor;

/// <summary>One titled card of fields on <c>PkRecordPage</c> (<c>Sections</c> in the main column, <c>Sidebar</c> beside it).</summary>
/// <param name="Heading">The card's title.</param>
/// <param name="Fields">The keys of the <see cref="PkFieldSpec{TItem}"/> fields it holds, in order.</param>
public sealed record PkRecordSection(string Heading, IReadOnlyList<string> Fields)
{
    /// <summary>Writes the typed sections, sidebar and title onto the page's config; one the host left out keeps what the config JSON says.</summary>
    internal static JsonObject Apply(JsonObject node, IReadOnlyList<PkRecordSection>? sections, IReadOnlyList<PkRecordSection>? sidebar, string? title)
    {
        if (sections is not null) node["sections"] = JsonNode.Parse(PkAttr.Json(sections)!);
        if (sidebar is not null) node["sidebar"] = JsonNode.Parse(PkAttr.Json(sidebar)!);
        if (!string.IsNullOrEmpty(title)) node["title"] = title;
        return node;
    }
}
