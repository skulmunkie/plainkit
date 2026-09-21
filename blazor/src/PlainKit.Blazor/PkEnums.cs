namespace PlainKit.Blazor;

/// <summary>The theme of a tool. <see cref="Auto"/> leaves the choice to the tool.</summary>
public enum PkTheme
{
    /// <summary>Leave the choice to the tool (it follows the page or the user's setting).</summary>
    Auto,
    /// <summary>The dark theme.</summary>
    Dark,
    /// <summary>The light theme.</summary>
    Light,
}

/// <summary>The viewport the gallery renders samples at.</summary>
public enum PkWidth
{
    /// <summary>The full width of the container.</summary>
    Desktop,
    /// <summary>A phone-sized viewport.</summary>
    Phone,
}

/// <summary><see cref="None"/> shows only the content, sized to fit; <see cref="Full"/> keeps the nav, toolbar and inspector.</summary>
public enum PkChrome
{
    /// <summary>Only the content, sized to fit.</summary>
    None,
    /// <summary>The nav, toolbar and inspector around the content.</summary>
    Full,
}

/// <summary>The colour of a <see cref="PkStat"/> value. <see cref="Neutral"/> is the element's default.</summary>
public enum PkStatTone
{
    /// <summary>The default colour.</summary>
    Neutral,
    /// <summary>Good news (green).</summary>
    Positive,
    /// <summary>Needs attention (amber).</summary>
    Warning,
    /// <summary>Bad news (red).</summary>
    Critical,
}

/// <summary>What the gallery shows.</summary>
public enum PkGalleryKind
{
    /// <summary>Everything: foundations, elements, layouts and templates.</summary>
    All,
    /// <summary>The foundations: tokens, typography, spacing and the like.</summary>
    Foundations,
    /// <summary>The controls. Kept for compatibility; it shows the same as <see cref="Elements"/>.</summary>
    Controls,
    /// <summary>The <c>pk-*</c> elements.</summary>
    Elements,
    /// <summary>The layouts.</summary>
    Layouts,
    /// <summary>The page templates.</summary>
    Templates,
}

/// <summary>How the dev tools are placed.</summary>
public enum PkDevToolsMode
{
    /// <summary>A floating button and a dock at the bottom of the page, shown and hidden with a hotkey.</summary>
    Dock,
    /// <summary>The same tabs, filling the component's own element.</summary>
    Inline,
}

/// <summary>How tall the dock is at first (the dock itself has buttons to change it).</summary>
public enum PkDevToolsSize
{
    /// <summary>40% of the window height.</summary>
    Medium,
    /// <summary>25% of the window height.</summary>
    Small,
    /// <summary>65% of the window height.</summary>
    Large,
}

internal static class PkEnumExtensions
{
    /// <summary>The lower-case attribute value, or null for the first member (the "leave it to the toolkit" default).</summary>
    internal static string? Attr<T>(this T value) where T : struct, Enum =>
        Convert.ToInt32(value) == 0 ? null : value.ToString().ToLowerInvariant();
}
