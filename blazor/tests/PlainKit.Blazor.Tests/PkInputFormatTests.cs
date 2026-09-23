using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue #208: typed round-trip helpers for pk-input type="date"/"number", so consumers stop re-deriving the same invariant-culture glue.
public sealed class PkInputFormatTests
{
    [Fact]
    public void Date_round_trips_through_format_and_parse()
    {
        var date = new DateTime(2026, 9, 23);
        var text = PkInputFormat.FormatDate(date);
        Assert.Equal("2026-09-23", text);
        Assert.Equal(date, PkInputFormat.ParseDate(text));
    }

    [Fact]
    public void Number_round_trips_through_format_and_parse()
    {
        var value = 42.5m;
        var text = PkInputFormat.FormatNumber(value);
        Assert.Equal("42.5", text);
        Assert.Equal(value, PkInputFormat.ParseNumber(text));
    }

    [Fact]
    public void Null_in_gives_empty_string_out()
    {
        Assert.Equal("", PkInputFormat.FormatDate(null));
        Assert.Equal("", PkInputFormat.FormatNumber(null));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-date")]
    [InlineData("2026/09/23")]     // not the exact yyyy-MM-dd format
    [InlineData("09-23-2026")]
    public void ParseDate_returns_null_for_empty_or_invalid_text(string? text) =>
        Assert.Null(PkInputFormat.ParseDate(text));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-number")]
    [InlineData("1.2.3")]
    public void ParseNumber_returns_null_for_empty_or_invalid_text(string? text) =>
        Assert.Null(PkInputFormat.ParseNumber(text));

    [Theory]
    [InlineData("-1")]
    [InlineData("-0.01")]
    [InlineData("-1000")]
    public void ParseNumber_rejects_negative_values(string text) =>
        Assert.Null(PkInputFormat.ParseNumber(text));

    [Fact]
    public void ParseNumber_accepts_zero_and_positive_values()
    {
        Assert.Equal(0m, PkInputFormat.ParseNumber("0"));
        Assert.Equal(12.34m, PkInputFormat.ParseNumber("12.34"));
    }

    [Fact]
    public void ParseInt_returns_the_fallback_for_empty_or_invalid_text()
    {
        Assert.Equal(0, PkInputFormat.ParseInt(null));
        Assert.Equal(0, PkInputFormat.ParseInt(""));
        Assert.Equal(0, PkInputFormat.ParseInt("not-a-number"));
        Assert.Equal(-1, PkInputFormat.ParseInt("nope", fallback: -1));
    }

    [Fact]
    public void ParseInt_parses_valid_whole_numbers_including_negative()
    {
        Assert.Equal(7, PkInputFormat.ParseInt("7"));
        Assert.Equal(-3, PkInputFormat.ParseInt("-3"));
    }
}
