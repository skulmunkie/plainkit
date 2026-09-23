using Microsoft.Extensions.Logging;

namespace PlainKit.Blazor;

/// <summary>How a <see cref="PkTimeZoneResolution"/>'s zone was found, so a misconfigured host is diagnosable instead of silently rendering the
/// wrong wall clock with nothing on screen to say so.</summary>
public enum PkTimeZoneResolutionSource
{
    /// <summary>The IANA id resolved via the host's system lookup (Linux, ICU-backed and most modern .NET hosts).</summary>
    Iana,

    /// <summary>The IANA id did not resolve; the Windows registry id did.</summary>
    Windows,

    /// <summary>Neither system id resolved (a trimmed / globalization-invariant host, or neither id was configured); a synthetic zone was built
    /// from the supplied DST rule data instead of the feature failing outright.</summary>
    Fallback,
}

/// <summary>A resolved zone and how it was found. Returned by <see cref="PkTimeZoneLogic.Resolve"/> and exposed as <see cref="IPkTimeZoneResolver.Resolution"/>.</summary>
public sealed record PkTimeZoneResolution(TimeZoneInfo TimeZone, PkTimeZoneResolutionSource Source);

/// <summary>
/// The organization's display timezone, supplied by the app on <see cref="PkOptions.TimeZone"/> (not hardcoded to any specific zone). Only
/// <see cref="IanaId"/> is required to get a real, DST-correct zone when the host resolves it; <see cref="WindowsId"/> and the rule fields are
/// what let the feature degrade instead of throwing when it does not.
/// </summary>
public sealed class PkTimeZoneOptions
{
    /// <summary>The IANA id (e.g. <c>America/New_York</c>), tried first.</summary>
    public string? IanaId { get; set; }

    /// <summary>The Windows registry id (e.g. <c>Eastern Standard Time</c>), tried when the IANA id does not resolve (a host where only the
    /// Windows database is present, or vice versa).</summary>
    public string? WindowsId { get; set; }

    /// <summary>The zone's standard (non-DST) UTC offset. Used only to build the <see cref="PkTimeZoneResolutionSource.Fallback"/> zone.</summary>
    public TimeSpan BaseUtcOffset { get; set; }

    /// <summary>The fallback zone's standard-time display name. Null defaults to <see cref="IanaId"/> (or <see cref="WindowsId"/>).</summary>
    public string? StandardName { get; set; }

    /// <summary>The fallback zone's daylight-time display name. Null defaults to <see cref="StandardName"/>.</summary>
    public string? DaylightName { get; set; }

    /// <summary>The DST transition rules for the fallback zone, e.g. built with <c>TimeZoneInfo.AdjustmentRule.CreateAdjustmentRule</c>.
    /// Null or empty means the fallback zone never observes DST (a fixed offset).</summary>
    public TimeZoneInfo.AdjustmentRule[]? AdjustmentRules { get; set; }
}

/// <summary>
/// Pure resolution logic for <see cref="PkTimeZoneOptions"/>: try the IANA id, then the Windows id, then build a synthetic zone from the
/// supplied rule data, and convert a <see cref="DateTime"/> into the resolved zone treating <see cref="DateTimeKind.Unspecified"/> as UTC. Each
/// step takes its system lookup as a parameter (matching <c>core/js/menu-logic.js</c>'s pure-function shape) so it is unit-testable without
/// depending on the host's OS or globalization mode.
/// </summary>
public static class PkTimeZoneLogic
{
    /// <summary>
    /// Resolves <paramref name="options"/> to a zone and how it was found. <paramref name="lookup"/> is the system lookup
    /// (<see cref="TimeZoneInfo.FindSystemTimeZoneById"/> in production, wrapped so it returns null instead of throwing); pass a stub that
    /// always returns null to simulate a host where the id does not resolve, without needing a specific OS.
    /// </summary>
    public static PkTimeZoneResolution Resolve(PkTimeZoneOptions options, Func<string, TimeZoneInfo?> lookup)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(lookup);

        if (!string.IsNullOrWhiteSpace(options.IanaId) && TryLookup(lookup, options.IanaId) is { } iana)
            return new PkTimeZoneResolution(iana, PkTimeZoneResolutionSource.Iana);

        if (!string.IsNullOrWhiteSpace(options.WindowsId) && TryLookup(lookup, options.WindowsId) is { } windows)
            return new PkTimeZoneResolution(windows, PkTimeZoneResolutionSource.Windows);

        return new PkTimeZoneResolution(BuildFallback(options), PkTimeZoneResolutionSource.Fallback);
    }

    // lookup may throw (its own doc says it can) or return null; either means "did not resolve" here, so a raw TimeZoneInfo.FindSystemTimeZoneById
    // can be passed directly without every caller wrapping it.
    private static TimeZoneInfo? TryLookup(Func<string, TimeZoneInfo?> lookup, string id)
    {
        try { return lookup(id); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { return null; }
    }

    /// <summary>
    /// Converts <paramref name="value"/> to <paramref name="zone"/>'s wall clock. <see cref="DateTimeKind.Unspecified"/> is treated as UTC (the
    /// common case for a timestamp read back from a database column that carries no kind), not the host's local kind; <see cref="DateTimeKind.Local"/>
    /// is converted from the host's actual local time first.
    /// </summary>
    public static DateTime ConvertToZone(DateTime value, TimeZoneInfo zone)
    {
        ArgumentNullException.ThrowIfNull(zone);
        var utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(utc, zone);
    }

    /// <summary>The system lookup used in production: <see cref="TimeZoneInfo.FindSystemTimeZoneById"/>, with the two exceptions it documents
    /// turned into a null return so callers never need a try/catch around a missing id.</summary>
    public static TimeZoneInfo? SystemLookup(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { return null; }
    }

    private static TimeZoneInfo BuildFallback(PkTimeZoneOptions options)
    {
        var id = options.IanaId ?? options.WindowsId ?? "PlainKit/Fallback";
        var standardName = options.StandardName ?? id;
        var daylightName = options.DaylightName ?? standardName;
        var rules = options.AdjustmentRules is { Length: > 0 } r ? r : null;
        return TimeZoneInfo.CreateCustomTimeZone(id, options.BaseUtcOffset, standardName, standardName, daylightName, rules);
    }
}

/// <summary>Resolves and caches the app's configured display timezone (<see cref="PkOptions.TimeZone"/>) once, and converts timestamps into it.
/// Registered by <c>AddPlainKit</c>; inject it in any component or service.</summary>
public interface IPkTimeZoneResolver
{
    /// <summary>The resolved zone and how it was found (<see cref="PkTimeZoneResolutionSource"/>). Resolved on first access and cached for the
    /// app's lifetime: the configured zone does not change while the app runs.</summary>
    PkTimeZoneResolution Resolution { get; }

    /// <summary>Converts <paramref name="value"/> to <see cref="Resolution"/>'s zone; see <see cref="PkTimeZoneLogic.ConvertToZone"/>.</summary>
    DateTime ToConfiguredZone(DateTime value);
}

internal sealed class PkTimeZoneResolver : IPkTimeZoneResolver
{
    private readonly Lazy<PkTimeZoneResolution> _resolution;

    public PkTimeZoneResolver(PkOptions options, ILogger<PkTimeZoneResolver> logger)
    {
        _resolution = new Lazy<PkTimeZoneResolution>(() => ResolveAndLog(options.TimeZone, logger));
    }

    public PkTimeZoneResolution Resolution => _resolution.Value;

    public DateTime ToConfiguredZone(DateTime value) => PkTimeZoneLogic.ConvertToZone(value, Resolution.TimeZone);

    // Not silent (AGENTS.md, "No silent failure"): a host that only ever resolves via Windows or the synthetic fallback is a misconfiguration
    // worth an operator's attention, so it is logged once, here, rather than left for someone to notice from an off-by-hours timestamp.
    private static PkTimeZoneResolution ResolveAndLog(PkTimeZoneOptions options, ILogger logger)
    {
        var resolution = PkTimeZoneLogic.Resolve(options, PkTimeZoneLogic.SystemLookup);
        switch (resolution.Source)
        {
            case PkTimeZoneResolutionSource.Windows:
                logger.LogWarning(
                    "PlainKit timezone '{IanaId}' did not resolve by its IANA id on this host; used the Windows id '{WindowsId}' instead",
                    options.IanaId, options.WindowsId);
                break;
            case PkTimeZoneResolutionSource.Fallback:
                logger.LogWarning(
                    "PlainKit timezone '{IanaId}' resolved by neither its IANA nor Windows id on this host; using a synthetic zone built from the configured DST rules",
                    options.IanaId);
                break;
        }
        return resolution;
    }
}
