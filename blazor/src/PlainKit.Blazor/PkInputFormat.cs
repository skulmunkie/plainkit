using System.Globalization;

namespace PlainKit.Blazor;

/// <summary>
/// Round-trip helpers between the plain text <c>pk-input</c> exchanges with the DOM and the strongly-typed C# values a form actually wants.
/// <c>PkInput</c>'s own <c>Value</c> stays plain <c>string</c>; these are pure static methods, not a second binding surface, so they can be
/// called from a property setter or a two-way-bound field without any hidden state. Every parse method
/// follows the same contract: empty or invalid text becomes <c>null</c> (or the documented fallback for <see cref="ParseInt"/>), never the
/// previous value — a parse method has no access to "the previous value" by construction, since it takes only the text.
/// </summary>
public static class PkInputFormat
{
    private const string DateFormat = "yyyy-MM-dd";

    /// <summary>
    /// Formats a date for <c>pk-input type="date"</c>'s <c>Value</c>: <c>yyyy-MM-dd</c>, invariant culture. Returns <c>""</c> for <c>null</c>
    /// (the empty string the element expects for no value).
    /// </summary>
    public static string FormatDate(DateTime? value) =>
        value is { } d ? d.ToString(DateFormat, CultureInfo.InvariantCulture) : "";

    /// <summary>
    /// Parses <c>pk-input type="date"</c>'s <c>Value</c> text back to a date, using <see cref="DateTime.TryParseExact(string?, string, IFormatProvider?, DateTimeStyles, out DateTime)"/>
    /// against <c>yyyy-MM-dd</c>, invariant culture. Empty or text that does not match that exact format returns <c>null</c> — never the
    /// previous value, never a thrown exception.
    /// </summary>
    public static DateTime? ParseDate(string? text) =>
        !string.IsNullOrWhiteSpace(text) &&
        DateTime.TryParseExact(text, DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var value)
            ? value
            : null;

    /// <summary>
    /// Formats a decimal for <c>pk-input type="number"</c>'s <c>Value</c>: invariant-culture text. Returns <c>""</c> for <c>null</c>.
    /// </summary>
    public static string FormatNumber(decimal? value) =>
        value is { } d ? d.ToString(CultureInfo.InvariantCulture) : "";

    /// <summary>
    /// Parses <c>pk-input type="number"</c>'s <c>Value</c> text back to a non-negative decimal, using
    /// <see cref="decimal.TryParse(string?, NumberStyles, IFormatProvider?, out decimal)"/> with <see cref="NumberStyles.Number"/> and
    /// invariant culture. Empty text, text that fails to parse, and negative values all return <c>null</c> — never the previous value, never a
    /// thrown exception. Use this for amounts that must never be negative (quantities, prices); a field that legitimately allows negative
    /// numbers needs its own parse, not this one.
    /// </summary>
    public static decimal? ParseNumber(string? text) =>
        !string.IsNullOrWhiteSpace(text) &&
        decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) &&
        value >= 0
            ? value
            : null;

    /// <summary>
    /// Parses <c>pk-input type="number"</c>'s <c>Value</c> text back to a whole number, using
    /// <see cref="int.TryParse(string?, NumberStyles, IFormatProvider?, out int)"/> with <see cref="NumberStyles.Integer"/> and invariant
    /// culture. Unlike <see cref="ParseNumber"/>, this returns a non-nullable <c>int</c>: empty or invalid text returns <paramref name="fallback"/>
    /// (default <c>0</c>) rather than a nullable "no value" — the right shape for a whole-number field (a count, a step) that always needs some
    /// number to work with. Callers that need to tell "no value" apart from a real zero should use <see cref="ParseNumber"/> instead and round
    /// or convert themselves.
    /// </summary>
    public static int ParseInt(string? text, int fallback = 0) =>
        !string.IsNullOrWhiteSpace(text) &&
        int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : fallback;
}
