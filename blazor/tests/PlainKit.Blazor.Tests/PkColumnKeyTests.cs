using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue #104: a column Key is used exactly as given (column definition, row field, cell slot, reported sort and filter keys), in any casing.
public sealed class PkColumnKeyTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Person(int Id, string Name, string City, string Role);

    private static readonly Person[] People = [new(1, "Ada", "Leeds", "Admin"), new(2, "Grace", "York", "User")];

    // Pascal, camel and mixed keys; Text, Cell and plain property columns.
    private static readonly PkTableColumn<Person>[] Columns =
    [
        new() { Key = "Name", Label = "Name", Sortable = true },
        new() { Key = "city", Label = "City", Sortable = true, Text = p => p.City.ToUpperInvariant() },
        new() { Key = "Role", Label = "Role", Sortable = true, Text = p => p.Role + "!" },
        new() { Key = "Badge", Label = "Badge", Cell = p => b => b.AddContent(0, "b:" + p.Name) },
        new() { Key = "cardId", Label = "Card", Cell = p => b => b.AddContent(0, "c:" + p.Id) },
    ];

    public PkColumnKeyTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static void AssertKeysAgree(AngleSharp.Dom.IElement table)
    {
        using var columns = JsonDocument.Parse(table.GetAttribute("columns")!);
        using var rows = JsonDocument.Parse(table.GetAttribute("rows")!);
        Assert.Equal(["Name", "city", "Role", "Badge", "cardId"], columns.RootElement.EnumerateArray().Select(c => c.GetProperty("key").GetString()));
        var row = rows.RootElement[0];
        Assert.Equal("Ada", row.GetProperty("Name").GetString());       // property found by a PascalCase key
        Assert.Equal("LEEDS", row.GetProperty("city").GetString());     // Text under a camelCase key
        Assert.Equal("Admin!", row.GetProperty("Role").GetString());    // Text under a PascalCase key: the key of the column definition
    }

    [Fact]
    public void Table_columns_and_rows_use_the_same_key_as_given()
    {
        var cut = Render<PkTable<Person>>(p => p.Add(x => x.Columns, Columns).Add(x => x.Items, People).Add(x => x.IdOf, x => x.Id.ToString()));
        AssertKeysAgree(cut.Find("pk-table"));
        Assert.Equal(["cell-1-Badge", "cell-1-cardId", "cell-2-Badge", "cell-2-cardId"], cut.FindAll("pk-table > span[slot]").Select(s => s.GetAttribute("slot")));
    }

    [Fact]
    public async Task Table_sort_filter_and_row_click_round_trip_with_the_key_as_given()
    {
        string? sort = null; string? direction = null; Dictionary<string, string>? filters = null; Person? clicked = null;
        var cut = Render<PkTable<Person>>(p => p
            .Add(x => x.Columns, Columns).Add(x => x.Items, People).Add(x => x.IdOf, x => x.Id.ToString()).Add(x => x.Clickable, true)
            .Add(x => x.OnSort, e => { sort = e.Key; direction = e.Direction; })
            .Add(x => x.OnFilter, e => filters = e.Filters)
            .Add(x => x.OnRowClick, e => clicked = e.Item));
        var table = cut.Find("pk-table");

        await table.TriggerEventAsync("onpk-sort", new PkSortEventArgs { Key = "Name", Direction = "descending" });
        Assert.Equal(("Name", "descending"), (sort, direction));
        Assert.Equal("Name", cut.Find("pk-table").GetAttribute("sort"));

        await table.TriggerEventAsync("onpk-filter", new PkFilterEventArgs { Filters = new() { ["Role"] = "adm" } });
        Assert.Equal("adm", filters!["Role"]);
        Assert.Equal("{\"Role\":\"adm\"}", cut.Find("pk-table").GetAttribute("filters"));   // the filter keys reach the element as given

        await table.TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "2" });
        Assert.Equal("Grace", clicked!.Name);
    }

    private IRenderedComponent<PkDataList<Person>> RenderList(List<PkListRequest> requests, Action<Person>? onClick = null) =>
        Render<PkDataList<Person>>(p =>
        {
            p.Add(x => x.Columns, Columns).Add(x => x.IdOf, x => x.Id.ToString());
            p.Add(x => x.Load, r => { requests.Add(r); return Task.FromResult(new PkListResult<Person>(People, People.Length)); });
            if (onClick is not null) p.Add(x => x.OnRowClick, onClick);
        });

    [Fact]
    public async Task DataList_shows_the_cells_and_reports_the_sort_key_as_given()
    {
        var requests = new List<PkListRequest>();
        var cut = RenderList(requests);
        AssertKeysAgree(cut.Find("pk-table"));

        await cut.Find("pk-table").TriggerEventAsync("onpk-sort", new PkSortEventArgs { Key = "Role", Direction = "descending" });
        Assert.Equal(("Role", true), (requests.Last().SortKey, requests.Last().Descending));
        Assert.Equal("Role", cut.Find("pk-table").GetAttribute("sort"));

        await cut.Find("pk-table").TriggerEventAsync("onpk-sort", new PkSortEventArgs { Key = "city", Direction = "ascending" });
        Assert.Equal("city", requests.Last().SortKey);
    }

    [Fact]
    public async Task DataList_first_column_with_a_PascalCase_key_shows_its_text_and_opens_the_row()
    {
        Person? opened = null;
        var requests = new List<PkListRequest>();
        var cut = RenderList(requests, x => opened = x);

        // The first column (Key "Name", no Text) is wrapped in the identity link: its text is the property found in any casing.
        Assert.Equal("Ada", cut.FindAll("pk-table > span[slot='cell-1-Name'] a").Single().TextContent);
        await cut.Find("pk-table").TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "2" });
        Assert.Equal("Grace", opened!.Name);
    }
}
