using PlainKit.Blazor;

namespace PlainKit.Playground.Components.Pages;

public sealed record Order(string Id, string OrderNo, string Customer);

/// <summary>The record page edits this one (typed fields, no JSON).</summary>
public sealed class OrderRecord
{
    public string Customer { get; set; } = "";
    public string Note { get; set; } = "";
}

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

    public static Task<OrderRecord?> GetAsync(string id)
    {
        var row = _rows.FirstOrDefault(x => x.Id == id);
        return Task.FromResult(row.Id is null ? null : new OrderRecord { Customer = row.Customer, Note = row.Note });
    }

    public static Task DeleteAsync(string id)
    {
        _rows.RemoveAll(x => x.Id == id);
        return Task.CompletedTask;
    }

    public static Task SaveAsync(string id, OrderRecord order)
    {
        var i = _rows.FindIndex(x => x.Id == id);
        if (i >= 0) _rows[i] = (id, order.Customer, order.Note);
        return Task.CompletedTask;
    }
}
