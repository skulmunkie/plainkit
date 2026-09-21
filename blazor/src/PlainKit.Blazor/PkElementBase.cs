using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>
/// The base of the generated element components (<c>Generated/</c>). It makes sure the toolkit's JavaScript is loaded once the first
/// component is on the page, through <see cref="PkRuntime"/>.
/// </summary>
public abstract class PkElementBase : ComponentBase
{
    [Inject] private PkRuntime Runtime { get; set; } = default!;

    /// <inheritdoc />
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender) await Runtime.EnsureInitializedAsync();
    }
}

/// <summary>Attribute values the generated components send to an element: invariant text for numbers and dates, JSON for structures.</summary>
internal static class PkAttr
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>A number in invariant culture, or null when unset (the attribute is left off).</summary>
    internal static string? Num(IFormattable? value) => value?.ToString(null, CultureInfo.InvariantCulture);

    /// <summary>A date as <c>yyyy-MM-dd</c>, or null when unset.</summary>
    internal static string? Date(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>The date in an ISO string, or null when it is empty or not a date.</summary>
    internal static DateOnly? ParseDate(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;

    /// <summary>The value as a JSON attribute (camelCase), or null when unset.</summary>
    internal static string? Json(object? value) => value is null ? null : JsonSerializer.Serialize(value, Web);
}
