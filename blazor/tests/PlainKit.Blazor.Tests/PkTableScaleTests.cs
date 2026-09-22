using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Blazor Server scalability of PkTable<T> (#129: "select all" used to send every id back and SignalR closes the circuit above 32 KB; #130: rows are serialised per change, not per render).
public sealed class PkTableScaleTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Row(string Id, string Name);

    private static readonly PkTableColumn<Row>[] Columns = [new() { Key = "name", Label = "Name" }];

    public PkTableScaleTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static Row[] Guids(int n) => Enumerable.Range(0, n).Select(i => new Row(Guid.NewGuid().ToString(), "Person " + i)).ToArray();

    private IRenderedComponent<PkTable<Row>> Table(Row[] rows, Action<Bunit.ComponentParameterCollectionBuilder<PkTable<Row>>>? more = null) => Render<PkTable<Row>>(p =>
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

    // ---- #130: the rows are serialised when Items, Columns or IdOf changed, not on every parameter set ----

    private static readonly Func<Row, string> IdOfRow = r => r.Id;

    private void Same(IRenderedComponent<PkTable<Row>> cut, Row[] rows, IReadOnlyList<PkTableColumn<Row>>? columns = null, Func<Row, string>? idOf = null, bool striped = false) =>
        cut.Render(p => p.Add(x => x.Columns, columns ?? Columns).Add(x => x.Items, rows).Add(x => x.IdOf, idOf ?? IdOfRow).Add(x => x.Selectable, true).Add(x => x.Striped, striped));

    [Fact]
    public void Unchanged_parameters_do_not_serialise_again_and_the_attribute_is_the_same_string()
    {
        var rows = Guids(500);
        var cut = Render<PkTable<Row>>(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, IdOfRow));
        Assert.Equal(1, cut.Instance.RebuildCount);
        var before = cut.Find("pk-table").GetAttribute("rows");

        Same(cut, rows);
        Same(cut, rows, striped: true);                                                  // another parameter
        Same(cut, rows, columns: [new() { Key = "name", Label = "Name" }]);             // a new array holding equal columns
        cut.Render();

        Assert.Equal(1, cut.Instance.RebuildCount);
        Assert.Equal(before, cut.Find("pk-table").GetAttribute("rows"));
    }

    [Fact]
    public void An_unchanged_parameter_set_of_5000_rows_allocates_next_to_nothing()
    {
        var rows = Guids(5000);
        var cut = Render<PkTable<Row>>(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, IdOfRow));
        Same(cut, rows); // warm up
        var before = GC.GetAllocatedBytesForCurrentThread();
        Same(cut, rows);
        var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert.True(allocated < 256 * 1024, $"{allocated / 1024} KB allocated for an unchanged parameter set (it was about 8.9 MB when every row was serialised again)");
    }

    [Fact]
    public void Another_list_columns_or_IdOf_serialise_again()
    {
        var rows = Guids(20);
        var cut = Render<PkTable<Row>>(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, rows).Add(x => x.IdOf, IdOfRow));

        var other = Guids(20);
        Same(cut, other);
        Assert.Equal(2, cut.Instance.RebuildCount);
        Assert.Contains(other[3].Id, cut.Find("pk-table").GetAttribute("rows"));

        Same(cut, other, columns: [new() { Key = "name", Label = "Full name" }]);
        Assert.Equal(3, cut.Instance.RebuildCount);
        Assert.Contains("Full name", cut.Find("pk-table").GetAttribute("columns"));

        Same(cut, other, columns: [new() { Key = "name", Label = "Full name" }], idOf: r => "x" + r.Id);
        Assert.Equal(4, cut.Instance.RebuildCount);
        Assert.Contains("x" + other[3].Id, cut.Find("pk-table").GetAttribute("rows"));
    }

    [Fact]
    public void A_list_that_grew_is_seen_and_a_changed_item_inside_it_needs_Refresh()
    {
        var list = new List<Row>(Guids(3));
        var cut = Render<PkTable<Row>>(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, list).Add(x => x.IdOf, IdOfRow));

        list.Add(new Row("added", "Added"));
        cut.Render(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, list).Add(x => x.IdOf, IdOfRow));
        Assert.Contains("\"added\"", cut.Find("pk-table").GetAttribute("rows"));

        list[0] = new Row(list[0].Id, "Renamed");           // same list, same count: not noticed by a parameter set
        cut.Render(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, list).Add(x => x.IdOf, IdOfRow));
        Assert.DoesNotContain("Renamed", cut.Find("pk-table").GetAttribute("rows"));

        cut.InvokeAsync(() => cut.Instance.Refresh());
        Assert.Contains("Renamed", cut.Find("pk-table").GetAttribute("rows"));
    }

    [Fact]
    public async Task A_data_list_that_re_renders_leaves_the_rows_of_its_table_alone()
    {
        var rows = Guids(50);
        var columns = new PkTableColumn<Row>[] { new() { Key = "name", Label = "Name" } };
        var cut = Render<PkDataList<Row>>(p => p
            .Add(x => x.Load, _ => Task.FromResult(new PkListResult<Row>(rows, rows.Length))).Add(x => x.Columns, columns).Add(x => x.IdOf, IdOfRow).Add(x => x.CurrentId, "a"));
        var table = cut.FindComponent<PkTable<Row>>();
        var built = table.Instance.RebuildCount;

        cut.Render(p => p.Add(x => x.Load, _ => Task.FromResult(new PkListResult<Row>(rows, rows.Length))).Add(x => x.Columns, columns).Add(x => x.IdOf, IdOfRow).Add(x => x.CurrentId, "b"));
        await cut.InvokeAsync(() => { });

        Assert.Equal(built, table.Instance.RebuildCount);
    }
}
