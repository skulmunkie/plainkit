namespace PlainKit.Blazor.Components
{
    // The seams the test helpers in PlainKit.Blazor.Testing use: the same load and row-click paths the element reaches through JavaScript.
    public partial class PkDataTable<TItem>
    {
        internal async Task<IReadOnlyList<TItem>> LoadForTestAsync(PkListPageQuery query)
        {
            await LoadPageAsync(query, CancellationToken.None);
            return _rows.Select(r => r.Item).ToList();
        }

        internal Task ClickRowForTestAsync(string id) => HandleRowClickAsync(new PkRowClickEventArgs { Id = id });
        internal Task ExpandRowForTestAsync(string id, bool open) => HandleRowExpandAsync(new PkRowExpandEventArgs { Id = id, Expanded = open });
    }
}

namespace PlainKit.Blazor.Testing
{
    /// <summary>Component tests for pages that use <see cref="Components.PkDataTable{TItem}"/>. Under bUnit there is no element, so these do what it does: <c>LoadAsync()</c> runs your <c>Load</c>
    /// (and renders the rows, cell and detail templates), <c>ClickRowAsync(id)</c> raises the row click, <c>ExpandRowAsync(id)</c> expands a row.</summary>
    public static class PkDataTableTesting
    {
        /// <summary>Loads one page the way the element does and returns the items of that page; the table has rendered them (read <c>cut.Markup</c> or <c>Find("[slot=cell-1-Name]")</c> after the await).</summary>
        /// <param name="table">The component, for example <c>cut.Instance</c>.</param>
        /// <param name="request">The query to load. Default: the first page with the table's own <c>PageSize</c>, <c>SortKey</c> and <c>Descending</c>, no search. Its <c>CancellationToken</c> is not used.</param>
        public static Task<IReadOnlyList<TItem>> LoadAsync<TItem>(this Components.PkDataTable<TItem> table, PkListRequest? request = null)
        {
            ArgumentNullException.ThrowIfNull(table);
            var query = request is null
                ? new PkListPageQuery(1, table.PageSize, table.SortKey, table.Descending ? "descending" : "ascending")
                : new PkListPageQuery(request.Page, request.PageSize, request.SortKey, request.Descending ? "descending" : "ascending", request.Search);
            return table.LoadForTestAsync(query);
        }

        /// <summary>Raises the element's row click for the loaded row with this id (<c>IdOf</c>), so <c>OnRowClick</c> gets the item; an id that is not a loaded row does nothing, as in the browser.</summary>
        public static Task ClickRowAsync<TItem>(this Components.PkDataTable<TItem> table, string id) => (table ?? throw new ArgumentNullException(nameof(table))).ClickRowForTestAsync(id);

        /// <summary>Raises the element's row expand for the loaded row with this id (Expanded follows it and OnRowExpand fires, never OnRowClick); <c>open: false</c> collapses it.</summary>
        public static Task ExpandRowAsync<TItem>(this Components.PkDataTable<TItem> table, string id, bool open = true) => (table ?? throw new ArgumentNullException(nameof(table))).ExpandRowForTestAsync(id, open);
    }
}
