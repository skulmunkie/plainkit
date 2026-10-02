using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>The old name of <see cref="PkDataTable{TItem}"/>, kept for one release: rename <c>PkDataList</c> to <c>PkDataTable</c>. Nothing else changes except the two parameters below.</summary>
/// <typeparam name="TItem">The type of a row.</typeparam>
[Obsolete("Use PkDataTable")]
public class PkDataList<TItem> : PkDataTable<TItem>
{
    /// <summary>The id of the row that is open elsewhere. Now <see cref="PkDataTable{TItem}.CurrentRow"/>: the whole row is tinted and marked <c>aria-current</c> (it was the first cell, in bold).</summary>
    [Parameter] public string? CurrentId { get => CurrentRow; set => CurrentRow = value; }

    /// <summary>Not used any more: "Select all N rows" is the query now (<c>Scope</c> <c>all</c> and <c>Query</c> in <see cref="PkDataTable{TItem}.OnSelect"/>), not a list of ids from your server. Run the bulk action against the query.</summary>
    [Parameter, Obsolete("Select all is the query now: use OnSelect (Scope all, Query) and run the bulk action against it.")] public Func<PkListRequest, Task<IReadOnlyList<string>>>? LoadAllIds { get; set; }
}
