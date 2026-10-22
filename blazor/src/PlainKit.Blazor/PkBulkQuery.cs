namespace PlainKit.Blazor;

/// <summary>Reads the query of a <see cref="PkBulkEventArgs"/> (<c>OnBulk</c>), like <see cref="PkSelectQuery"/> does for a selection.</summary>
public static class PkBulkQuery
{
    /// <summary>The search, sort and filters the bulk action refers to, as the <see cref="PkListRequest"/> <c>Load</c> got; null when the event carries no query. For <c>Scope</c> <c>all</c> run the action on the server against it, ignoring <c>Page</c> and <c>PageSize</c>.</summary>
    public static PkListRequest? ToRequest(this PkBulkEventArgs e) => new PkSelectEventArgs { Query = e.Query }.ToRequest();
}
