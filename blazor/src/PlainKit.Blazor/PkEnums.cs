namespace PlainKit.Blazor;

/// <summary>The theme of a tool. <see cref="Auto"/> leaves the choice to the tool.</summary>
public enum PkTheme { Auto, Dark, Light }

/// <summary>The viewport the gallery renders samples at.</summary>
public enum PkWidth { Desktop, Phone }

/// <summary><see cref="None"/> shows only the content, sized to fit; <see cref="Full"/> keeps the nav, toolbar and inspector.</summary>
public enum PkChrome { None, Full }

/// <summary>What the gallery shows.</summary>
public enum PkGalleryKind { All, Foundations, Controls, Elements, Layouts, Templates }

internal static class PkEnumExtensions
{
    /// <summary>The lower-case attribute value, or null for the first member (the "leave it to the toolkit" default).</summary>
    internal static string? Attr<T>(this T value) where T : struct, Enum =>
        Convert.ToInt32(value) == 0 ? null : value.ToString().ToLowerInvariant();
}
