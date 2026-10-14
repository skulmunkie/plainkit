using PlainKit.Blazor;

namespace PlainKit.AppSample.Modules;

public sealed record Order(string Id, string Customer, string Status, string Total);

/// <summary>The sample's data (the same four orders as the SDK sample).</summary>
public static class OrderStore
{
    public static readonly IReadOnlyList<Order> All =
    [
        new("7", "Ada Lovelace", "Open", "$120.00"), new("8", "Grace Hopper", "Shipped", "$86.50"),
        new("9", "Alan Turing", "Open", "$240.00"), new("10", "Edsger Dijkstra", "Shipped", "$64.00"),
    ];

    public static Task<PkListResult<Order>> ListAsync(string? status, PkListRequest r)
    {
        var rows = All.Where(o => status is null || o.Status == status).ToList();
        return Task.FromResult(new PkListResult<Order>(rows, rows.Count));
    }

    public static Task<Order?> GetAsync(string id) => Task.FromResult(All.FirstOrDefault(o => o.Id == id));
}
