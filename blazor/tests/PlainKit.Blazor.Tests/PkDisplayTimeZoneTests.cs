using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #205: a fixed, configured display time zone, so a host's own OS zone never leaks into a rendered timestamp.
public sealed class PkDisplayTimeZoneTests
{
    [Fact]
    public void Resolves_by_the_IANA_id_when_the_host_has_it()
    {
        var tz = new PkDisplayTimeZone("Etc/UTC", "UTC");
        Assert.Equal(PkTimeZoneSource.System, tz.Resolution.Source);
        Assert.Equal("Etc/UTC", tz.Resolution.ResolvedId);
        Assert.Equal(TimeZoneInfo.Utc.BaseUtcOffset, tz.TimeZone.BaseUtcOffset);
    }

    [Fact]
    public void Falls_back_to_the_caller_supplied_zone_when_neither_id_resolves()
    {
        var synthetic = TimeZoneInfo.CreateCustomTimeZone("pk-test-zone", TimeSpan.FromHours(5.5), "Test", "Test");
        var tz = new PkDisplayTimeZone("Nowhere/Fake", "Nonexistent Standard Time", synthetic);
        Assert.Equal(PkTimeZoneSource.Fallback, tz.Resolution.Source);
        Assert.Same(synthetic, tz.TimeZone);
        Assert.Equal("pk-test-zone", tz.Resolution.ResolvedId);
    }

    [Fact]
    public void Falls_back_to_UTC_when_neither_id_resolves_and_no_fallback_was_given()
    {
        var tz = new PkDisplayTimeZone("Nowhere/Fake", "Nonexistent Standard Time");
        Assert.Equal(PkTimeZoneSource.Fallback, tz.Resolution.Source);
        Assert.Equal(TimeZoneInfo.Utc, tz.TimeZone);
        Assert.Null(tz.Resolution.ResolvedId);
    }

    [Fact]
    public void Resolution_runs_once_and_is_cached()
    {
        var tz = new PkDisplayTimeZone("Etc/UTC", "UTC");
        var first = tz.Resolution;
        Assert.Same(first.TimeZone, tz.Resolution.TimeZone);
    }

    [Fact]
    public void An_unspecified_kind_is_treated_as_UTC_not_the_host_local_kind()
    {
        var tz = new PkDisplayTimeZone("Nowhere/Fake", "Nonexistent Standard Time", TimeZoneInfo.CreateCustomTimeZone("pk-plus-2", TimeSpan.FromHours(2), "Plus2", "Plus2"));
        var unspecified = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Unspecified);
        var utc = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);
        Assert.Equal(tz.ToDisplay(utc), tz.ToDisplay(unspecified));
        Assert.Equal(14, tz.ToDisplay(unspecified).Hour);
    }

    [Fact]
    public void A_local_kind_is_converted_to_UTC_first_not_treated_as_already_UTC()
    {
        var tz = new PkDisplayTimeZone("Etc/UTC", "UTC");
        var local = new DateTime(2026, 6, 1, 12, 0, 0, DateTimeKind.Local);
        Assert.Equal(local.ToUniversalTime(), tz.ToDisplay(local).UtcDateTime);
    }

    [Fact]
    public void A_DateTimeOffset_is_converted_directly_without_a_kind_decision()
    {
        var tz = new PkDisplayTimeZone("Nowhere/Fake", "Nonexistent Standard Time", TimeZoneInfo.CreateCustomTimeZone("pk-plus-2b", TimeSpan.FromHours(2), "Plus2", "Plus2"));
        var offset = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero);
        Assert.Equal(14, tz.ToDisplay(offset).Hour);
    }

    [Theory]
    [InlineData("", "UTC")]
    [InlineData("Etc/UTC", "")]
    public void Rejects_a_blank_id(string iana, string windows)
    {
        Assert.Throws<ArgumentException>(() => new PkDisplayTimeZone(iana, windows));
    }
}
