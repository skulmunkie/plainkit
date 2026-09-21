namespace PlainKit.Blazor;

/// <summary>What a <see cref="PkDataList{TItem}"/> asks its <c>Load</c> function for: one page of the list, in the order and with the search the user chose.</summary>
/// <param name="Search">The text in the search box, trimmed; null when it is empty.</param>
/// <param name="SortKey">The key of the column the list is sorted by; null for the default order.</param>
/// <param name="Descending">True when the sort is descending.</param>
/// <param name="Page">The page to load, starting at 1.</param>
/// <param name="PageSize">How many items a page holds.</param>
public sealed record PkListRequest(string? Search, string? SortKey, bool Descending, int Page, int PageSize)
{
    /// <summary>Cancelled when a newer request replaces this one (the user typed, sorted or paged again) or the list goes away. Pass it to the database call; the list ignores the result of a superseded request in any case.</summary>
    public CancellationToken CancellationToken { get; init; }

    /// <summary>The number of items to skip: <c>(Page - 1) * PageSize</c>, for <c>Skip</c> in a query.</summary>
    public int Skip => (Math.Max(1, Page) - 1) * PageSize;
}

/// <summary>One page of a list, and how many items the whole (searched) list has.</summary>
/// <typeparam name="T">The type of an item.</typeparam>
/// <param name="Items">The items of the requested page.</param>
/// <param name="Total">The number of items in the whole list for the request's search, not only this page. The pager and the last-page correction use it.</param>
public sealed record PkListResult<T>(IReadOnlyList<T> Items, int Total);

/// <summary>
/// The state a <see cref="PkDataList{TItem}"/> owns (search, sort, page, page size, total) and the rules that change it. Kept apart from the
/// component so the rules are plain code: changing the search, the sort or the page size goes back to page 1, and a total that shrinks under the
/// current page settles on the last page that exists.
/// </summary>
internal sealed class PkListState
{
    public string? Search { get; private set; }
    public string? SortKey { get; private set; }
    public bool Descending { get; private set; }
    public int Page { get; private set; } = 1;
    public int PageSize { get; private set; } = 25;
    public int Total { get; private set; }

    public PkListState(int pageSize = 25, string? sortKey = null, bool descending = false)
    {
        PageSize = Math.Max(1, pageSize);
        SortKey = string.IsNullOrEmpty(sortKey) ? null : sortKey;
        Descending = descending;
    }

    /// <summary>The number of pages the current total needs (at least 1, so an empty list still has a page 1).</summary>
    public int Pages => Math.Max(1, (int)Math.Ceiling(Total / (double)PageSize));

    /// <summary>The request for the current state.</summary>
    public PkListRequest ToRequest(CancellationToken cancellation = default) => new(Search, SortKey, Descending, Page, PageSize) { CancellationToken = cancellation };

    /// <summary>A new search text (trimmed; empty is no search). Returns true when it changed the list, which goes back to page 1.</summary>
    public bool SetSearch(string? text)
    {
        var next = string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        if (next == Search) return false;
        Search = next;
        Page = 1;
        return true;
    }

    /// <summary>A new sort. Returns true when it changed anything; the list goes back to page 1.</summary>
    public bool SetSort(string? key, bool descending)
    {
        var next = string.IsNullOrEmpty(key) ? null : key;
        if (next == SortKey && descending == Descending) return false;
        SortKey = next;
        Descending = descending;
        Page = 1;
        return true;
    }

    /// <summary>A new page (at least 1). Returns true when it changed.</summary>
    public bool SetPage(int page)
    {
        page = Math.Max(1, page);
        if (page == Page) return false;
        Page = page;
        return true;
    }

    /// <summary>A new page size. Returns true when it changed; the list goes back to page 1.</summary>
    public bool SetPageSize(int size)
    {
        size = Math.Max(1, size);
        if (size == PageSize) return false;
        PageSize = size;
        Page = 1;
        return true;
    }

    /// <summary>
    /// Takes the total a load reported. Returns true when the current page no longer exists (the total shrank, for example after a delete): the
    /// state has then moved to the last page and the list has to load it.
    /// </summary>
    public bool SetTotal(int total)
    {
        Total = Math.Max(0, total);
        if (Page <= Pages) return false;
        Page = Pages;
        return true;
    }
}
