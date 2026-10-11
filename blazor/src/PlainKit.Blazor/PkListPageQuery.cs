namespace PlainKit.Blazor;

/// <summary>What <c>pk-list-page</c> passes its <c>load</c> callback, read from JSON: <c>{ page, pageSize, sort, sortDir, search, filters }</c>.</summary>
internal sealed record PkListPageQuery(int Page = 1, int PageSize = 25, string? Sort = null, string? SortDir = null, string? Search = null, Dictionary<string, System.Text.Json.JsonElement>? Filters = null)
{
    /// <summary>The <see cref="PkListRequest"/> a <c>PkListPage</c> <c>Load</c> gets: an empty search is null, a sort without a key is none.</summary>
    public PkListRequest ToRequest() => new(
        string.IsNullOrWhiteSpace(Search) ? null : Search.Trim(),
        string.IsNullOrEmpty(Sort) ? null : Sort,
        string.Equals(SortDir, "descending", StringComparison.OrdinalIgnoreCase),
        Math.Max(1, Page),
        Math.Max(1, PageSize))
    {
        Filters = NonEmpty(Of(false, v => v.ToString())),
        MultiFilters = NonEmpty(Of(true, v => (IReadOnlyList<string>)v.EnumerateArray().Select(x => x.ToString()).ToList())),
    };

    // A filter value is a string, or an array of strings for a multiselect; a number or boolean is read as its text, null as no value.
    private Dictionary<string, T> Of<T>(bool array, Func<System.Text.Json.JsonElement, T> read) =>
        (Filters ?? []).Where(kv => kv.Value.ValueKind != System.Text.Json.JsonValueKind.Null && (kv.Value.ValueKind == System.Text.Json.JsonValueKind.Array) == array)
            .ToDictionary(kv => kv.Key, kv => read(kv.Value));

    private static Dictionary<string, T>? NonEmpty<T>(Dictionary<string, T> d) => d.Count > 0 ? d : null;
}
