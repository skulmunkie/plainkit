namespace PlainKit.Blazor;

/// <summary>Where the toolkit's files are served from when PlainKit.Blazor is referenced (static web assets).</summary>
public static class PkAssets
{
    /// <summary>The folder holding the toolkit's <c>dist</c>; every other path here is relative to it.</summary>
    public const string Root = "_content/PlainKit.Blazor/plainkit/";

    /// <summary>The page stylesheet: tokens, base, utilities and the layout the custom elements rely on.</summary>
    public const string Css = Root + "plainkit.css";

    /// <summary>The page <c>&lt;pk-gallery&gt;</c> frames.</summary>
    public const string GalleryEmbed = Root + "gallery/embed.html";

    internal const string Bridge = "./_content/PlainKit.Blazor/plainkit.blazor.js";
}
