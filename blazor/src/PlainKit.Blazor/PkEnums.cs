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

internal static class PkEnumExtensions
{
    /// <summary>The lower-case attribute value, or null for the first member (the "leave it to the toolkit" default).</summary>
    internal static string? Attr<T>(this T value) where T : struct, Enum =>
        Convert.ToInt32(value) == 0 ? null : value.ToString().ToLowerInvariant();
}
