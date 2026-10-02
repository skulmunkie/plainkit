namespace PlainKit.Blazor
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
    }
}

namespace PlainKit.Blazor.Testing
{
    /// <summary>
    /// Component tests for pages that use <see cref="PkDataTable{TItem}"/>. In the browser the element calls <c>Load</c>; under bUnit there is no element,
    /// so nothing loads and no rows, <c>Cell</c> output or row click exist. These helpers do what the element does: <c>await cut.Instance.LoadAsync()</c>
    /// runs your <c>Load</c> (and renders the rows and cell templates), <c>ClickRowAsync(id)</c> raises the row click.
    /// </summary>
    public static class PkDataTableTesting
    {
        /// <summary>Loads one page the way the element does and returns the items of that page; the table has rendered them (read <c>cut.Markup</c> or <c>Find("[slot=cell-1-Name]")</c> after the await).</summary>
        /// <param name="table">The component, for example <c>cut.Instance</c>.</param>
        /// <param name="request">The query to load. Default: the first page with the table's own <c>PageSize</c>, <c>SortKey</c> and <c>Descending</c>, no search. Its <c>CancellationToken</c> is not used.</param>
        public static Task<IReadOnlyList<TItem>> LoadAsync<TItem>(this PkDataTable<TItem> table, PkListRequest? request = null)
        {
            ArgumentNullException.ThrowIfNull(table);
            var query = request is null
                ? new PkListPageQuery(1, table.PageSize, table.SortKey, table.Descending ? "descending" : "ascending")
                : new PkListPageQuery(request.Page, request.PageSize, request.SortKey, request.Descending ? "descending" : "ascending", request.Search);
            return table.LoadForTestAsync(query);
        }

        /// <summary>Raises the element's row click for the loaded row with this id (<c>IdOf</c>), so <c>OnRowClick</c> gets the item; an id that is not a loaded row does nothing, as in the browser.</summary>
        public static Task ClickRowAsync<TItem>(this PkDataTable<TItem> table, string id)
        {
            ArgumentNullException.ThrowIfNull(table);
            return table.ClickRowForTestAsync(id);
        }
    }
}
