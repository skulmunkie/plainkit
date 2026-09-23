namespace PlainKit.Blazor;

/// <summary>How <see cref="PkDisplayTimeZone"/> found its <see cref="TimeZoneInfo"/>.</summary>
public enum PkTimeZoneSource
{
    /// <summary>Resolved by the host's own <see cref="TimeZoneInfo.FindSystemTimeZoneById(string)"/>, from either id given to the constructor.</summary>
    System,

    /// <summary>Neither id resolved (a globalization-invariant or trimmed deploy is the common cause): a caller-supplied or synthetic zone was used instead.</summary>
    Fallback,
}

/// <summary>How a <see cref="PkDisplayTimeZone"/> resolved: the zone actually in use, where it came from, and which id (or that none) resolved it. Log or
/// surface this once at startup so a host whose globalization data is missing shows up as a diagnosable fallback, not a silently wrong wall clock.</summary>
public sealed record PkTimeZoneResolution(TimeZoneInfo TimeZone, PkTimeZoneSource Source, string? ResolvedId);

/// <summary>
/// A fixed, configured display time zone for an app that always renders wall-clock timestamps in one organization zone, regardless of the host's own.
/// Looks the zone up by its IANA id first (Linux, ICU), then its Windows registry id (a trimmed or globalization-invariant deploy may resolve only one,
/// or neither), and falls back to a caller-supplied <see cref="TimeZoneInfo"/> — build one with <see cref="TimeZoneInfo.CreateCustomTimeZone(string, TimeSpan, string, string)"/>
/// and its own <see cref="TimeZoneInfo.AdjustmentRule"/>s for a zone whose DST transitions matter — or, with none given, to UTC. The resolution never throws and
/// runs once; <see cref="Resolution"/> says which of the three actually happened.
/// </summary>
public sealed class PkDisplayTimeZone
{
    private readonly TimeZoneInfo? _fallback;
    private readonly Lazy<PkTimeZoneResolution> _resolution;

    /// <param name="ianaId">The zone's IANA id, e.g. <c>Europe/Berlin</c>.</param>
    /// <param name="windowsId">The same zone's Windows registry id, e.g. <c>W. Europe Standard Time</c>.</param>
    /// <param name="fallback">Used only when neither id resolves on this host. Omit to fall back to UTC.</param>
    public PkDisplayTimeZone(string ianaId, string windowsId, TimeZoneInfo? fallback = null)
    {
        if (string.IsNullOrWhiteSpace(ianaId)) throw new ArgumentException("An IANA id is required.", nameof(ianaId));
        if (string.IsNullOrWhiteSpace(windowsId)) throw new ArgumentException("A Windows id is required.", nameof(windowsId));
        IanaId = ianaId;
        WindowsId = windowsId;
        _fallback = fallback;
        _resolution = new Lazy<PkTimeZoneResolution>(Resolve);
    }

    /// <summary>The IANA id given to the constructor.</summary>
    public string IanaId { get; }

    /// <summary>The Windows id given to the constructor.</summary>
    public string WindowsId { get; }

    /// <summary>How the zone resolved on this host. Read once and cache, or log at startup; resolution runs only the first time this is read.</summary>
    public PkTimeZoneResolution Resolution => _resolution.Value;

    /// <summary>The resolved zone: shorthand for <c>Resolution.TimeZone</c>.</summary>
    public TimeZoneInfo TimeZone => Resolution.TimeZone;

    private PkTimeZoneResolution Resolve()
    {
        foreach (var id in new[] { IanaId, WindowsId })
        {
            try { return new PkTimeZoneResolution(TimeZoneInfo.FindSystemTimeZoneById(id), PkTimeZoneSource.System, id); }
            catch (TimeZoneNotFoundException) { } catch (InvalidTimeZoneException) { }
        }
        return new PkTimeZoneResolution(_fallback ?? TimeZoneInfo.Utc, PkTimeZoneSource.Fallback, _fallback?.Id);
    }

    /// <summary>
    /// An instant converted to this zone's wall clock. <paramref name="instant"/>'s <see cref="DateTime.Kind"/> of <see cref="DateTimeKind.Unspecified"/>
    /// (a value read back from a database column that carries no kind, the common case) is treated as UTC, never as the host's own local kind.
    /// </summary>
    public DateTimeOffset ToDisplay(DateTime instant)
    {
        var utc = instant.Kind == DateTimeKind.Local ? instant.ToUniversalTime() : DateTime.SpecifyKind(instant, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTime(new DateTimeOffset(utc), TimeZone);
    }

    /// <summary>An instant already carrying its own offset, converted to this zone's wall clock.</summary>
    public DateTimeOffset ToDisplay(DateTimeOffset instant) => TimeZoneInfo.ConvertTime(instant, TimeZone);
}
