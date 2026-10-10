namespace PlainKit.Blazor;

/// <summary>What a <see cref="Components.PkDataTable{TItem}"/> asks its <c>Load</c> function for: one page of the list, in the order and with the search the user chose.</summary>
/// <param name="Search">The text in the search box, trimmed; null when it is empty.</param>
/// <param name="SortKey">The key of the column the list is sorted by; null for the default order.</param>
/// <param name="Descending">True when the sort is descending.</param>
/// <param name="Page">The page to load, starting at 1.</param>
/// <param name="PageSize">How many items a page holds.</param>
public sealed record PkListRequest(string? Search, string? SortKey, bool Descending, int Page, int PageSize)
{
    /// <summary>Cancelled when a newer request replaces this one (the user typed, sorted or paged again) or the list goes away. Pass it to the database call; the list ignores the result of a superseded request in any case.</summary>
    public CancellationToken CancellationToken { get; init; }

    /// <summary>The values of the filter fields a <see cref="Pages.PkListPage{TItem}"/> shows, keyed by filter key (text, as typed or chosen); null when none is set. Always null for a <see cref="Components.PkDataTable{TItem}"/>.</summary>
    public IReadOnlyDictionary<string, string>? Filters { get; init; }

    /// <summary>The values of the <c>multiselect</c> filters (several chosen options), keyed by filter key; null when none is set. A filter holds its value in <see cref="Filters"/> (one text) or here (a list), never both.</summary>
    public IReadOnlyDictionary<string, IReadOnlyList<string>>? MultiFilters { get; init; }

    /// <summary>The number of items to skip: <c>(Page - 1) * PageSize</c>, for <c>Skip</c> in a query.</summary>
    public int Skip => (Math.Max(1, Page) - 1) * PageSize;
}

/// <summary>One page of a list, and how many items the whole (searched) list has.</summary>
/// <typeparam name="T">The type of an item.</typeparam>
/// <param name="Items">The items of the requested page.</param>
/// <param name="Total">The number of items in the whole list for the request's search, not only this page. The pager and the last-page correction use it.</param>
public sealed record PkListResult<T>(IReadOnlyList<T> Items, int Total);

/// <summary>Reads the query of a <see cref="Components.PkDataTable{TItem}"/> selection.</summary>
public static class PkSelectQuery
{
    private static readonly System.Text.Json.JsonSerializerOptions Web = new(System.Text.Json.JsonSerializerDefaults.Web);

    /// <summary>The search and sort (and page and size) the selection refers to, as the <see cref="PkListRequest"/> <c>Load</c> got; null when the event carries no query. For <c>Scope</c> <c>all</c> run the bulk action against it, ignoring <c>Page</c> and <c>PageSize</c>.</summary>
    public static PkListRequest? ToRequest(this PkSelectEventArgs e) => e.Query is { ValueKind: System.Text.Json.JsonValueKind.Object } q ? System.Text.Json.JsonSerializer.Deserialize<PkListPageQuery>(q, Web)?.ToRequest() : null;
}
