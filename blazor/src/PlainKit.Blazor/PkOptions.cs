namespace PlainKit.Blazor;

/// <summary>Settings for PlainKit.Blazor, passed to <c>AddPlainKit</c>.</summary>
public sealed class PkOptions
{
    /// <summary>
    /// Whether the dev tools page (<c>/_plainkit</c>) is served and the <c>PkDevTools</c> dock renders anything. Null, the default, means only when the app
    /// runs in the Development environment (a dock left in a layout is inert in production); set true or false to decide explicitly.
    /// </summary>
    public bool? DevTools { get; set; }

    /// <summary>The folder the dev tools' Files tab browses. Null means the app's content root. Server-side rendering only.</summary>
    public string? SourceRoot { get; set; }

    /// <summary>Skips a folder (relative path, forward slashes) when the Files tab is built. Return true to skip.</summary>
    public Func<string, bool>? SourceExclude { get; set; }

    /// <summary>What the dev tools' Scorecard tab scores. Null means the toolkit's own page templates.</summary>
    public IReadOnlyList<PkScoreTarget>? ScoreTargets { get; set; }

    /// <summary>The SDK logger's settings and the ILogger bridge: level, per-scope levels, routes, and whether SDK entries also go to <see cref="Microsoft.Extensions.Logging.ILogger"/>.</summary>
    public PkLoggingOptions Logging { get; } = new();

    /// <summary>The organization's display timezone (IANA id, Windows id and DST-fallback rules), resolved by <see cref="IPkTimeZoneResolver"/>. Unset, the resolved zone is the synthetic fallback with a zero offset.</summary>
    public PkTimeZoneOptions TimeZone { get; } = new();
}
