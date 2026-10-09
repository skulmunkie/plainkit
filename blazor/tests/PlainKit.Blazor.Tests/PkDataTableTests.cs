using System.Text.Json;
using System.Text.Json.Nodes;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkDataTable<TItem> (issue #801 step 5): a typed wrapper over pk-data-table. The element owns the query, the paging, the states and the selection, so
// these tests play the element: they call the load callback the component handed to the bridge (setCallback) and raise the element's events.
public sealed class PkDataTableTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Customer(int Id, string Name, string City);

    private static readonly PkTableColumn<Customer>[] Columns =
    [
        new() { Key = "Name", Label = "Name", Sortable = true, Cell = c => b => b.AddContent(0, "cell:" + c.Name) },
        new() { Key = "city", Label = "City", Sortable = true, HidePhone = true, Text = c => c.City.ToUpperInvariant() },
    ];

    private readonly BunitJSModuleInterop _bridge;
    private readonly List<PkListRequest> _requests = [];
    private readonly List<TaskCompletionSource<PkListResult<Customer>>> _pending = [];

    public PkDataTableTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static PkListResult<Customer> Page(int total, params string[] names) =>
        new(names.Select((n, i) => new Customer(i + 1, n, "Leeds")).ToList(), total);

    private Func<PkListRequest, Task<PkListResult<Customer>>> Immediate(Func<PkListRequest, PkListResult<Customer>> answer) => r =>
    {
        _requests.Add(r);
        return Task.FromResult(answer(r));
    };

    // A Load that waits: the test completes each request itself.
    private Task<PkListResult<Customer>> Deferred(PkListRequest r)
    {
        _requests.Add(r);
        var tcs = new TaskCompletionSource<PkListResult<Customer>>();
        _pending.Add(tcs);
        return tcs.Task;
    }

    private IRenderedComponent<PkDataTable<Customer>> Render(Func<PkListRequest, Task<PkListResult<Customer>>>? load, Action<ComponentParameterCollectionBuilder<PkDataTable<Customer>>>? more = null) =>
        Render<PkDataTable<Customer>>(p =>
        {
            if (load is not null) p.Add(x => x.Load, load);
            p.Add(x => x.Columns, Columns).Add(x => x.IdOf, c => c.Id.ToString());
            more?.Invoke(p);
        });

    private PkCallbackHost<PkListPageQuery> Host() =>
        Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]).Value;

    // What the element does: calls load(query) and gets { rows, total } back.
    private static async Task<JsonElement> Ask(IRenderedComponent<PkDataTable<Customer>> cut, PkCallbackHost<PkListPageQuery> host, PkListPageQuery? query = null) =>
        JsonSerializer.SerializeToElement(await cut.InvokeAsync(() => host.Invoke(query ?? new PkListPageQuery())));

    private static PkListRequest Plain(PkListRequest r) => r with { CancellationToken = default };

    [Fact]
    public void It_renders_pk_data_table_with_the_options_as_attributes_and_hands_it_the_load_callback()
    {
        var cut = Render(Immediate(_ => Page(0)), p => p.Add(x => x.Label, "Customers").Add(x => x.PagerLabel, "Customer pages").Add(x => x.SearchPlaceholder, "Search customers")
            .Add(x => x.PageSize, 50).Add(x => x.SortKey, "city").Add(x => x.Descending, true).Add(x => x.SearchDebounceMs, 450));

        var el = cut.Find("pk-data-table");
        Assert.False(el.HasAttribute("config"));
        using var columns = JsonDocument.Parse(el.GetAttribute("columns")!);
        Assert.Equal(["Name", "city"], columns.RootElement.EnumerateArray().Select(x => x.GetProperty("key").GetString()));
        Assert.Equal("50", el.GetAttribute("page-size"));
        using var sizes = JsonDocument.Parse(el.GetAttribute("page-size-options")!);
        Assert.Equal([10, 25, 50, 100], sizes.RootElement.EnumerateArray().Select(x => x.GetInt32()));
        Assert.Equal(("city", "descending"), (el.GetAttribute("sort"), el.GetAttribute("sort-dir")));
        Assert.Equal(("Customers", "Customer pages", "Search customers", "450"), (el.GetAttribute("label"), el.GetAttribute("pager-label"), el.GetAttribute("search-label"), el.GetAttribute("search-debounce")));
        Assert.False(el.HasAttribute("hide-search"));
        using var empty = JsonDocument.Parse(el.GetAttribute("empty")!);
        Assert.Equal("Nothing to show.", empty.RootElement.GetProperty("heading").GetString());
        using var none = JsonDocument.Parse(el.GetAttribute("no-results")!);
        Assert.Equal("Nothing matches your search.", none.RootElement.GetProperty("heading").GetString());
        Assert.Equal("The list could not be loaded.", el.GetAttribute("load-error"));
        Assert.True(el.HasAttribute("cards"));
        Assert.False(el.HasAttribute("clickable"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("load", call.Arguments[1]);
        Assert.Equal(true, call.Arguments[3]);   // an element that drew its empty state before the callback existed redraws
    }

    [Fact]
    public void Search_and_SelectPageOnly_pass_through_to_the_element()
    {
        var cut = Render(Immediate(_ => Page(0)), p => p.Add(x => x.Search, "acme").Add(x => x.Selectable, true).Add(x => x.SelectPageOnly, true));
        var el = cut.Find("pk-data-table");
        Assert.Equal("acme", el.GetAttribute("search"));
        Assert.True(el.HasAttribute("select-page-only"));
        Assert.False(Render(Immediate(_ => Page(0)), p => p.Add(x => x.Selectable, true)).Find("pk-data-table").HasAttribute("select-page-only"));
    }

    [Fact]
    public void Without_Load_no_callback_is_set()
    {
        Render(null);
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task Load_gets_the_query_as_a_request_and_returns_rows_with_ids_keys_as_given_and_the_total()
    {
        var cut = Render(Immediate(_ => Page(60, "Ada", "Grace")));
        var host = Host();

        var json = await Ask(cut, host, JsonSerializer.Deserialize<PkListPageQuery>("{\"page\":3,\"pageSize\":10,\"sort\":\"city\",\"sortDir\":\"descending\",\"search\":\" ab \"}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!);

        Assert.Equal(new PkListRequest("ab", "city", true, 3, 10), Plain(_requests.Single()));
        Assert.Equal(60, json.GetProperty("total").GetInt32());
        var row = json.GetProperty("rows")[1];
        Assert.Equal(("2", "Grace", "LEEDS"), (row.GetProperty("id").GetString(), row.GetProperty("Name").GetString(), row.GetProperty("city").GetString()));   // the property under a PascalCase key, Text under its key
        await Ask(cut, host, new PkListPageQuery(Sort: "", Search: "  "));
        Assert.Equal(new PkListRequest(null, null, false, 1, 25), Plain(_requests.Last()));
    }

    [Fact]
    public async Task Cell_templates_fill_the_cell_slots_of_the_loaded_rows_only()
    {
        var cut = Render(Immediate(r => r.Search is null ? Page(2, "Ada", "Grace") : Page(1, "Zed")));
        Assert.Empty(cut.FindAll("[slot^=cell-]"));
        var host = Host();

        await Ask(cut, host);
        Assert.Equal(["cell-1-Name", "cell-2-Name"], cut.FindAll("pk-data-table > span[slot]").Select(s => s.GetAttribute("slot")));
        Assert.Equal("cell:Grace", cut.Find("[slot=cell-2-Name]").TextContent);

        await Ask(cut, host, new PkListPageQuery(Search: "z"));
        Assert.Equal(["cell-1-Name"], cut.FindAll("pk-data-table > span[slot]").Select(s => s.GetAttribute("slot")));
        Assert.Equal("cell:Zed", cut.Find("[slot=cell-1-Name]").TextContent);
    }

    [Fact]
    public async Task A_newer_request_cancels_the_older_one_and_the_older_answer_is_not_drawn()
    {
        var cut = Render(Deferred);
        var host = Host();
        var first = cut.InvokeAsync(() => host.Invoke(new PkListPageQuery(Search: "a"), 1));
        var second = cut.InvokeAsync(() => host.Invoke(new PkListPageQuery(Search: "ab"), 2));
        cut.WaitForState(() => _pending.Count == 2);
        host.Cancel(1);                                      // the element aborts the older request's signal
        Assert.True(_requests[0].CancellationToken.IsCancellationRequested);
        Assert.False(_requests[1].CancellationToken.IsCancellationRequested);

        _pending[1].SetResult(Page(1, "Newest"));
        await second;
        cut.WaitForAssertion(() => Assert.Equal("cell:Newest", cut.Find("[slot=cell-1-Name]").TextContent));
        _pending[0].SetResult(Page(1, "Stale"));            // the older one arrives late
        var stale = JsonSerializer.SerializeToElement(await first);
        Assert.Empty(stale.GetProperty("rows").EnumerateArray());
        Assert.DoesNotContain("Stale", cut.Markup);
        Assert.Contains("Newest", cut.Markup);
    }

    [Fact]
    public async Task A_cancelled_request_that_throws_is_not_reported_as_an_error_and_a_real_failure_is()
    {
        Exception? reported = null;
        var cut = Render(Deferred, p => p.Add(x => x.OnLoadError, e => reported = e));
        var host = Host();
        var first = cut.InvokeAsync(() => host.Invoke(new PkListPageQuery(Search: "x"), 1));
        var second = cut.InvokeAsync(() => host.Invoke(new PkListPageQuery(Search: "y"), 2));   // supersedes the first
        cut.WaitForState(() => _pending.Count == 2);
        host.Cancel(1);
        _pending[0].SetCanceled(_requests[0].CancellationToken);                              // a database call throws like this
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        Assert.Null(reported);

        _pending[1].SetException(new InvalidOperationException("db down"));
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => second);          // the rejection is the element's error state with Retry
        Assert.Same(e, reported);
    }

    [Fact]
    public async Task Disposing_cancels_the_request_in_flight()
    {
        var cut = Render(Deferred);
        var call = cut.InvokeAsync(() => Host().Invoke(new PkListPageQuery()));
        cut.WaitForState(() => _pending.Count == 1);

        await DisposeComponentsAsync();

        Assert.True(_requests[0].CancellationToken.IsCancellationRequested);
        _pending[0].SetCanceled(_requests[0].CancellationToken);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => call);
    }

    [Fact]
    public async Task A_row_click_reports_the_item_of_the_loaded_row_and_OnRowClick_makes_rows_clickable()
    {
        Customer? opened = null;
        var cut = Render(Immediate(_ => Page(2, "Ada", "Grace")), p => p.Add(x => x.OnRowClick, c => opened = c).Add(x => x.CurrentRow, "2"));
        var el = cut.Find("pk-data-table");
        Assert.True(el.HasAttribute("clickable"));
        Assert.Equal("2", el.GetAttribute("current-row"));
        await Ask(cut, Host());

        await el.TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "2" });
        Assert.Equal("Grace", opened!.Name);

        opened = null;
        await el.TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "99" });   // not a loaded row
        Assert.Null(opened);
    }

    [Fact]
    public async Task ReloadAsync_asks_the_element_to_load_again()
    {
        var cut = Render(Immediate(_ => Page(0)));
        await cut.InvokeAsync(() => cut.Instance.ReloadAsync());
        var call = Assert.Single(_bridge.Invocations["refresh"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
    }

    [Fact]
    public async Task The_add_label_and_pk_add_and_the_toolbar_empty_and_bulk_content_go_to_the_element()
    {
        var added = 0;
        var cut = Render(Immediate(_ => Page(0)), p => p
            .Add(x => x.AddLabel, "+ Add customer")
            .Add(x => x.OnAdd, () => added++)
            .Add(x => x.ToolbarContent, b => b.AddMarkupContent(0, "<i id=extra></i>"))
            .Add(x => x.EmptyContent, b => b.AddMarkupContent(0, "<b id=none></b>"))
            .Add(x => x.BulkContent, b => b.AddMarkupContent(0, "<u id=bulk></u>")));

        Assert.NotNull(cut.Find("[slot=actions] #extra"));
        Assert.Equal("+ Add customer", cut.Find("pk-data-table").GetAttribute("add-label"));
        await cut.Find("pk-data-table").TriggerEventAsync("onpk-add", new PkAddEventArgs());
        Assert.Equal(1, added);
        Assert.NotNull(cut.Find("[slot=empty] #none"));
        Assert.NotNull(cut.Find("[slot=bulk] #bulk"));
    }

    // Selection (#798, the query model of #801): the element keeps the ids across pages and searches and raises one pk-select with the ids, the scope and the query.
    private static Task Pick(IRenderedComponent<PkDataTable<Customer>> cut, string scope, string query, params string[] ids) =>
        cut.Find("pk-data-table").TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Selected = ids, Scope = scope, Query = JsonDocument.Parse(query).RootElement.Clone() });

    private const string Everyone = "{\"page\":1,\"pageSize\":25,\"sort\":\"city\",\"sortDir\":\"descending\",\"search\":\" ab \",\"filters\":{}}";

    [Fact]
    public async Task The_selection_is_two_way_across_pages_and_a_value_from_the_host_is_sent_to_the_element()
    {
        IReadOnlyList<string>? selected = null;
        var cut = Render(Immediate(_ => Page(60, "Ada")), p => p.Add(x => x.Selectable, true).Add(x => x.SelectedChanged, s => selected = s).Add(x => x.Selected, new[] { "9" }));
        var el = cut.Find("pk-data-table");
        Assert.True(el.HasAttribute("selectable"));
        Assert.Equal("[\"9\"]", el.GetAttribute("selected"));

        await Pick(cut, "page", Everyone, "9", "1", "31");   // ids of other pages stay: the element reports every selected id

        Assert.Equal(["9", "1", "31"], selected);
        Assert.Equal("[\"9\",\"1\",\"31\"]", cut.Find("pk-data-table").GetAttribute("selected"));
        Assert.Equal("page", cut.Find("pk-data-table").GetAttribute("select-scope"));
        Assert.Equal(["9", "1", "31"], cut.Instance.Selected!.ToArray());
    }

    [Fact]
    public async Task Select_all_is_the_query_not_a_list_of_ids()
    {
        PkSelectEventArgs? seen = null;
        var cut = Render(Immediate(_ => Page(112, "Ada", "Grace")), p => p.Add(x => x.Selectable, true).Add(x => x.OnSelect, e => seen = e));

        await Pick(cut, "all", Everyone, "1", "2");

        Assert.Equal("all", seen!.Scope);
        Assert.Equal(["1", "2"], seen.Selected!);   // only the loaded page: the rest of the 112 is the query
        Assert.Equal("all", cut.Find("pk-data-table").GetAttribute("select-scope"));
        Assert.Equal("all", cut.Instance.SelectScope);
        var query = seen.ToRequest()!;
        Assert.Equal(("ab", "city", true), (query.Search, query.SortKey, query.Descending));

        await Pick(cut, "page", Everyone, "1");           // a changed selection goes back to the page scope
        Assert.Equal("page", cut.Find("pk-data-table").GetAttribute("select-scope"));
    }

    [Fact]
    public async Task A_big_selection_arrives_as_runs_and_is_expanded_to_ids_of_the_loaded_rows()
    {
        IReadOnlyList<string>? selected = null;
        var rows = Enumerable.Range(1, 100).Select(i => new Customer(i, "C" + i, "Leeds")).ToList();
        var cut = Render(Immediate(_ => new PkListResult<Customer>(rows, 400)), p => p.Add(x => x.Selectable, true).Add(x => x.SelectedChanged, s => selected = s));
        await Ask(cut, Host());
        var el = cut.Find("pk-data-table");

        await el.TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Ranges = [0, 69, 99, 99], RowCount = 100, FirstId = "1", LastId = "100", Scope = "page" });
        Assert.Equal(71, selected!.Count);
        Assert.Equal(("1", "70", "100"), (selected[0], selected[69], selected[70]));

        selected = null;                                                                      // rows that are not the loaded ones: dropped, the next event carries it
        await el.TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Ranges = [0, 9], RowCount = 7, FirstId = "1", LastId = "7" });
        Assert.Null(selected);
    }

    [Fact]
    public async Task A_pk_select_from_a_menu_in_a_cell_is_not_a_selection()
    {
        var changed = 0;
        var cut = Render(Immediate(_ => Page(1, "Ada")), p => p.Add(x => x.Selectable, true).Add(x => x.SelectedChanged, _ => changed++));
        await cut.Find("pk-data-table").TriggerEventAsync("onpk-select", new PkTableSelectEventArgs { Value = "edit" });
        Assert.Equal(0, changed);
    }
}
