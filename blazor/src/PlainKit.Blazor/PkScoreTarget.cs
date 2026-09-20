using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>Something for <c>PkScorecard</c> to score: a page of the same origin, or markup rendered with the toolkit's stylesheets.</summary>
public sealed record PkScoreTarget
{
    /// <summary>The name shown in the ranked table.</summary>
    [JsonPropertyName("name"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Name { get; init; }

    /// <summary>A same-origin URL. A page on another origin cannot be read and scores as one "unreadable" error.</summary>
    [JsonPropertyName("url"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Url { get; init; }

    /// <summary>Markup rendered inside a frame carrying the toolkit's stylesheets.</summary>
    [JsonPropertyName("html"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Html { get; init; }

    /// <summary>A page of the same origin.</summary>
    public static PkScoreTarget Page(string url, string? name = null) => new() { Url = url, Name = name ?? url };

    /// <summary>A fragment of markup.</summary>
    public static PkScoreTarget Markup(string name, string html) => new() { Name = name, Html = html };
}
