using Microsoft.Extensions.Logging.Abstractions;

namespace PlainKit.Blazor.Tests;

// Issue #205: an app's rendered timestamps must show one fixed, configured organizational timezone regardless of the host's own OS timezone.
// PkTimeZoneLogic.Resolve takes the system lookup as a parameter so the IANA/Windows/fallback chain is testable without a specific host OS or
// globalization mode: these stubs simulate "resolves", "does not resolve" and "throws" (FindSystemTimeZoneById's documented failure modes).
public class TimeZoneResolverTests
{
    private static Func<string, TimeZoneInfo?> Only(string id, TimeZoneInfo zone) => candidate => candidate == id ? zone : null;

    private static readonly TimeZoneInfo Eastern = TimeZoneInfo.CreateCustomTimeZone("America/New_York", TimeSpan.FromHours(-5), "Eastern", "Eastern");
    private static readonly TimeZoneInfo EasternWindows = TimeZoneInfo.CreateCustomTimeZone("Eastern Standard Time", TimeSpan.FromHours(-5), "Eastern", "Eastern");

    [Fact]
    public void Resolves_by_iana_id_when_the_system_lookup_finds_it()
    {
        var options = new PkTimeZoneOptions { IanaId = "America/New_York", WindowsId = "Eastern Standard Time" };
        var resolution = PkTimeZoneLogic.Resolve(options, Only("America/New_York", Eastern));

        Assert.Same(Eastern, resolution.TimeZone);
        Assert.Equal(PkTimeZoneResolutionSource.Iana, resolution.Source);
    }

    [Fact]
    public void Falls_back_to_the_windows_id_when_the_iana_id_does_not_resolve()
    {
        var options = new PkTimeZoneOptions { IanaId = "America/New_York", WindowsId = "Eastern Standard Time" };
        var resolution = PkTimeZoneLogic.Resolve(options, Only("Eastern Standard Time", EasternWindows));

        Assert.Same(EasternWindows, resolution.TimeZone);
        Assert.Equal(PkTimeZoneResolutionSource.Windows, resolution.Source);
    }

    [Fact]
    public void Falls_back_to_a_synthetic_zone_when_neither_system_id_resolves()
    {
        var options = new PkTimeZoneOptions
        {
            IanaId = "America/New_York",
            WindowsId = "Eastern Standard Time",
            BaseUtcOffset = TimeSpan.FromHours(-5),
            StandardName = "EST",
            DaylightName = "EDT",
        };
        var resolution = PkTimeZoneLogic.Resolve(options, _ => null);

        Assert.Equal(PkTimeZoneResolutionSource.Fallback, resolution.Source);
        Assert.Equal(TimeSpan.FromHours(-5), resolution.TimeZone.BaseUtcOffset);
        Assert.Equal("America/New_York", resolution.TimeZone.Id);
    }

    [Fact]
    public void A_lookup_that_throws_the_documented_exceptions_is_treated_as_not_found()
    {
        var options = new PkTimeZoneOptions { IanaId = "Not/A/Zone", BaseUtcOffset = TimeSpan.Zero };
        var resolution = PkTimeZoneLogic.Resolve(options, _ => throw new TimeZoneNotFoundException());

        Assert.Equal(PkTimeZoneResolutionSource.Fallback, resolution.Source);
    }

    [Fact]
    public void The_system_lookup_wrapper_turns_a_missing_id_into_null_instead_of_throwing()
    {
        Assert.Null(PkTimeZoneLogic.SystemLookup("Definitely/Not/A/Real/Zone/Id"));
    }

    [Fact]
    public void Unspecified_kind_is_treated_as_utc_not_the_host_local_kind()
    {
        var unspecified = new DateTime(2024, 6, 1, 12, 0, 0, DateTimeKind.Unspecified);
        var converted = PkTimeZoneLogic.ConvertToZone(unspecified, Eastern);

        // Eastern here is a fixed -5 offset custom zone (no DST rules), so UTC noon becomes 07:00.
        Assert.Equal(new DateTime(2024, 6, 1, 7, 0, 0), converted);
    }

    [Fact]
    public void Utc_kind_converts_directly()
    {
        var utc = new DateTime(2024, 6, 1, 12, 0, 0, DateTimeKind.Utc);
        var converted = PkTimeZoneLogic.ConvertToZone(utc, Eastern);

        Assert.Equal(new DateTime(2024, 6, 1, 7, 0, 0), converted);
    }

    [Fact]
    public void The_service_resolves_once_and_caches_the_resolution()
    {
        var options = new PkOptions();
        options.TimeZone.IanaId = "Not/A/Real/Zone";
        options.TimeZone.BaseUtcOffset = TimeSpan.FromHours(2);

        var resolver = new PkTimeZoneResolver(options, NullLogger<PkTimeZoneResolver>.Instance);

        var first = resolver.Resolution;
        var second = resolver.Resolution;

        Assert.Equal(PkTimeZoneResolutionSource.Fallback, first.Source);
        Assert.Same(first.TimeZone, second.TimeZone);
    }

    [Fact]
    public void The_service_converts_using_its_resolved_zone()
    {
        var options = new PkOptions();
        options.TimeZone.IanaId = "Not/A/Real/Zone";
        options.TimeZone.BaseUtcOffset = TimeSpan.FromHours(-5);

        var resolver = new PkTimeZoneResolver(options, NullLogger<PkTimeZoneResolver>.Instance);
        var converted = resolver.ToConfiguredZone(new DateTime(2024, 6, 1, 12, 0, 0, DateTimeKind.Unspecified));

        Assert.Equal(new DateTime(2024, 6, 1, 7, 0, 0), converted);
    }
}
