using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Tests;

// The supported test seam for pages that use PkDataTable<TItem> (#853). These tests are written the way a consumer writes theirs: only the public
// API (PkDataTableTesting) and the rendered markup, no reflection and no internal types.
public sealed class PkDataTableTestingTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Customer(int Id, string Name);

    private static readonly PkTableColumn<Customer>[] Columns =
    [
        new() { Key = "Name", Label = "Name", Cell = c => b => b.AddContent(0, "cell:" + c.Name) },
    ];

    public PkDataTableTestingTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_consumer_loads_rows_reads_the_cell_output_and_clicks_a_row()
    {
        PkListRequest? asked = null;
        Customer? opened = null;
        var cut = Render<PkDataTable<Customer>>(p => p
            .Add(x => x.Columns, Columns)
            .Add(x => x.IdOf, c => c.Id.ToString())
            .Add(x => x.PageSize, 10)
            .Add(x => x.Load, r =>
            {
                asked = r;
                return Task.FromResult(new PkListResult<Customer>([new(1, "Ada"), new(2, "Grace")], 2));
            })
            .Add(x => x.OnRowClick, c => opened = c));
        Assert.Empty(cut.FindAll("[slot^=cell-]"));   // nothing loads under bUnit by itself

        var items = await cut.Instance.LoadAsync();

        Assert.Equal(["Ada", "Grace"], items.Select(c => c.Name));
        Assert.Equal(new PkListRequest(null, null, false, 1, 10), asked! with { CancellationToken = default });   // the element's first query
        Assert.Equal("cell:Grace", cut.Find("[slot=cell-2-Name]").TextContent);

        await cut.Instance.ClickRowAsync("2");
        Assert.Equal("Grace", opened!.Name);

        opened = null;
        await cut.Instance.ClickRowAsync("99");   // not a loaded row: nothing, as in the browser
        Assert.Null(opened);
    }

    [Fact]
    public async Task A_request_answers_a_search_a_sort_and_a_page_the_way_the_element_would()
    {
        var seen = new List<PkListRequest>();
        var cut = Render<PkDataTable<Customer>>(p => p
            .Add(x => x.Columns, Columns)
            .Add(x => x.IdOf, c => c.Id.ToString())
            .Add(x => x.Load, r =>
            {
                seen.Add(r);
                return Task.FromResult(new PkListResult<Customer>(r.Search == "z" ? [new(7, "Zed")] : [new(1, "Ada")], 1));
            }));

        await cut.Instance.LoadAsync();
        var items = await cut.Instance.LoadAsync(new PkListRequest("z", "Name", true, 2, 5));

        Assert.Equal("Zed", Assert.Single(items).Name);
        Assert.Equal(new PkListRequest("z", "Name", true, 2, 5), seen[1] with { CancellationToken = default });
        Assert.Equal(["cell-7-Name"], cut.FindAll("pk-data-table > span[slot]").Select(s => s.GetAttribute("slot")));   // the rows of the last load replace the earlier ones
    }
}
