using PlainKit.Blazor;

namespace PlainKit.Playground.Components.Pages;

public sealed record Order(string Id, string OrderNo, string Customer);

/// <summary>An in-memory stand-in for the data access of the routed list and record pages (guide "A routed list and record page").</summary>
internal static class RoutedOrderStore
{
    private static readonly List<(string Id, string Customer, string Note)> _rows =
        Enumerable.Range(1, 25).Select(i => (i.ToString(), $"Customer {i}", "")).ToList();

    public static Task<PkListResult<Order>> PageAsync(PkListRequest r)
    {
        var all = _rows.Where(x => r.Search is null || x.Customer.Contains(r.Search, StringComparison.OrdinalIgnoreCase)).ToList();
        var page = all.Skip(r.Skip).Take(r.PageSize).Select(x => new Order(x.Id, "SO-" + x.Id, x.Customer)).ToList();
        return Task.FromResult(new PkListResult<Order>(page, all.Count));
    }

    public static Task<IReadOnlyDictionary<string, object?>?> GetAsync(string id)
    {
        var row = _rows.FirstOrDefault(x => x.Id == id);
        IReadOnlyDictionary<string, object?>? result = row.Id is null ? null : new Dictionary<string, object?> { ["customer"] = row.Customer, ["note"] = row.Note };
        return Task.FromResult(result);
    }

    public static Task SaveAsync(string id, string customer, string note)
    {
        var i = _rows.FindIndex(x => x.Id == id);
        if (i >= 0) _rows[i] = (id, customer, note);
        return Task.CompletedTask;
    }
}
