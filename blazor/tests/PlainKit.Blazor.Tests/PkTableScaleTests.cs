using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Blazor Server scalability of PkTable<T> (#129: "select all" used to send every id back and SignalR closes the circuit above 32 KB; #130: rows are serialised per change, not per render).
public sealed class PkTableScaleTests : TestContext
{
    private sealed record Row(string Id, string Name);

    private static readonly PkTableColumn<Row>[] Columns = [new() { Key = "name", Label = "Name" }];

    public PkTableScaleTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static Row[] Guids(int n) => Enumerable.Range(0, n).Select(i => new Row(Guid.NewGuid().ToString(), "Person " + i)).ToArray();

    private IRenderedComponent<PkTable<Row>> Table(Row[] rows, Action<Bunit.ComponentParameterCollectionBuilder<PkTable<Row>>>? more = null) => RenderComponent<PkTable<Row>>(p =>
    {
        p.Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, r => r.Id).Add(x => x.Selectable, true);
        more?.Invoke(p);
    });

    // What the browser's createEventArgs (wwwroot module) sends for a pk-select of the same selection: the detail as JSON, the size limit being SignalR's 32 KB default.
    private const int Limit = 32 * 1024;

    private static int Bytes(object detail) => JsonSerializer.SerializeToUtf8Bytes(detail).Length;

    [Fact]
    public void Reproduction_the_ids_of_a_select_all_on_5000_rows_are_over_the_receive_limit_and_the_ranges_are_not()
    {
        var rows = Guids(5000);
        Assert.True(Bytes(new { selected = rows.Select(r => r.Id) }) > Limit, "the whole selection is what closed the circuit");
        Assert.True(Bytes(new { ranges = new[] { 0, 4999 }, rowCount = 5000, firstId = rows[0].Id, lastId = rows[^1].Id }) < 256);
    }

    [Fact]
    public async Task A_select_all_arrives_as_one_run_and_becomes_the_ids_of_every_row()
    {
        var rows = Guids(5000);
        IReadOnlyList<string>? selected = null;
        PkSelectEventArgs? args = null;
        var cut = Table(rows, p => p.Add(x => x.SelectedChanged, s => selected = s).Add(x => x.OnSelect, a => args = a));

        await cut.Find("pk-table").TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Ranges = [0, 4999], RowCount = 5000, FirstId = rows[0].Id, LastId = rows[^1].Id });

        Assert.Equal(rows.Select(r => r.Id), selected);
        Assert.Equal(rows.Select(r => r.Id), args!.Selected);
        Assert.Equal(5000, JsonSerializer.Deserialize<string[]>(cut.Find("pk-table").GetAttribute("selected")!)!.Length);
    }

    [Fact]
    public async Task Runs_with_gaps_select_exactly_those_rows()
    {
        var rows = Guids(100);
        IReadOnlyList<string>? selected = null;
        var cut = Table(rows, p => p.Add(x => x.SelectedChanged, s => selected = s));

        await cut.Find("pk-table").TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Ranges = [0, 9, 50, 50, 90, 99], RowCount = 100, FirstId = rows[0].Id, LastId = rows[^1].Id });

        Assert.Equal(rows[..10].Concat([rows[50]]).Concat(rows[90..]).Select(r => r.Id), selected);
    }

    [Fact]
    public async Task A_selection_for_other_rows_than_the_table_holds_is_ignored()
    {
        var rows = Guids(100);
        IReadOnlyList<string>? selected = null;
        var cut = Table(rows, p => p.Add(x => x.SelectedChanged, s => selected = s));
        var table = cut.Find("pk-table");

        await table.TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Ranges = [0, 99], RowCount = 99, FirstId = rows[0].Id, LastId = rows[^1].Id });
        await table.TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Ranges = [0, 99], RowCount = 100, FirstId = "other", LastId = rows[^1].Id });

        Assert.Null(selected);
    }

    [Fact]
    public void The_element_is_marked_so_the_browser_sends_ranges()
    {
        Assert.True(Table(Guids(3)).Find("pk-table").HasAttribute("data-pk-ranges"));
    }
}
