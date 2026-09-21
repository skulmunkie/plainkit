namespace PlainKit.Blazor;

/// <summary>One step of a breadcrumb trail for <see cref="PkPageHeader"/>: the text and where it goes. The last crumb of a trail is the current page.</summary>
/// <param name="Label">The text of the crumb.</param>
/// <param name="Href">Where it links to; null renders the crumb as plain text (for a step that has no page of its own, and usually for the current page).</param>
public sealed record PkCrumb(string Label, string? Href = null);
