using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkDataList<TItem> (issue #50): the state rules (PkListState), and the component: request building, superseded loads, paging, states.
public sealed class PkListStateTests
{
    [Fact]
    public void The_request_carries_search_sort_page_and_size()
    {
        var state = new PkListState(pageSize: 10, sortKey: "name", descending: true);
        state.SetSearch("  ada ");
        state.SetPage(3);

        var request = state.ToRequest();

        Assert.Equal(new PkListRequest("ada", "name", true, 3, 10), request with { });
        Assert.Equal(20, request.Skip);
    }

    [Fact]
    public void Search_sort_and_page_size_go_back_to_page_1_and_a_no_op_does_not()
    {
        var state = new PkListState(25);
        state.SetPage(4);
        Assert.False(state.SetSearch(null));           // unchanged
        Assert.Equal(4, state.Page);

        Assert.True(state.SetSearch("x"));
        Assert.Equal(1, state.Page);
        state.SetPage(4);
        Assert.True(state.SetSort("name", false));
        Assert.Equal(1, state.Page);
        state.SetPage(4);
        Assert.False(state.SetSort("name", false));
        Assert.True(state.SetSort("name", true));
        state.SetPage(4);
        Assert.True(state.SetPageSize(50));
        Assert.Equal(1, state.Page);
        Assert.False(state.SetPageSize(50));
    }

    [Fact]
    public void A_blank_search_is_no_search()
    {
        var state = new PkListState();
        state.SetSearch("a");
        Assert.True(state.SetSearch("   "));
        Assert.Null(state.Search);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(10, 1)]
    [InlineData(11, 2)]
    [InlineData(100, 10)]
    public void Pages_follow_the_total(int total, int pages)
    {
        var state = new PkListState(10);
        state.SetTotal(total);
        Assert.Equal(pages, state.Pages);
    }

    [Fact]
    public void A_total_that_no_longer_reaches_the_page_settles_on_the_last_page()
    {
        var state = new PkListState(10);
        state.SetPage(5);

        Assert.True(state.SetTotal(25));       // 3 pages
        Assert.Equal(3, state.Page);
        Assert.False(state.SetTotal(25));      // now it exists
        state.SetPage(3);
        Assert.True(state.SetTotal(0));        // an empty list has a page 1
        Assert.Equal(1, state.Page);
    }
}

public sealed class PkDataListTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Customer(int Id, string Name, string City);

    private static readonly PkTableColumn<Customer>[] Columns =
    [
        new() { Key = "name", Label = "Name", Sortable = true },
        new() { Key = "city", Label = "City", Sortable = true, HidePhone = true },
    ];

    private readonly List<PkListRequest> _requests = [];
    private readonly List<TaskCompletionSource<PkListResult<Customer>>> _pending = [];

    public PkDataListTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static PkListResult<Customer> Page(int total, params string[] names) =>
        new(names.Select((n, i) => new Customer(i + 1, n, "Leeds")).ToList(), total);

    // A Load that answers at once with the given function.
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

    private IRenderedComponent<PkDataList<Customer>> Render(Func<PkListRequest, Task<PkListResult<Customer>>> load, Action<ComponentParameterCollectionBuilder<PkDataList<Customer>>>? more = null) =>
        Render<PkDataList<Customer>>(p =>
        {
            p.Add(x => x.Load, load).Add(x => x.Columns, Columns).Add(x => x.IdOf, c => c.Id.ToString());
            more?.Invoke(p);
        });

    private static PkListRequest Plain(PkListRequest r) => r with { CancellationToken = default };

    private static Task Search(IRenderedComponent<PkDataList<Customer>> cut, string text) =>
        cut.Find("pk-input").TriggerEventAsync("onpk-search", new PkSearchEventArgs { Value = text });

    [Fact]
    public void It_loads_page_1_at_first_and_shows_the_rows_the_pager_and_the_names()
    {
        var cut = Render(Immediate(_ => Page(60, "Ada", "Grace")), p => p.Add(x => x.Label, "Customers").Add(x => x.PagerLabel, "Customer pages").Add(x => x.SearchPlaceholder, "Search customers"));

        Assert.Equal(new PkListRequest(null, null, false, 1, 25), Plain(_requests.Single()));
        var table = cut.Find("pk-table");
        Assert.True(table.HasAttribute("manual"));
        Assert.False(table.HasAttribute("loading"));
        Assert.Equal("Customers", table.GetAttribute("label"));
        Assert.Contains("Grace", table.GetAttribute("rows"));
        var pager = cut.Find("pk-pagination");
        Assert.Equal("60", pager.GetAttribute("total"));
        Assert.Equal("Customer pages", pager.GetAttribute("label"));
        Assert.Equal("[10,25,50,100]", pager.GetAttribute("sizes"));
        Assert.Equal("Search customers", cut.Find("pk-input").GetAttribute("label"));
        Assert.True(table.HasAttribute("cards"));
    }

    [Fact]
    public void The_table_is_loading_while_the_first_request_is_in_flight_and_shows_no_rows()
    {
        var cut = Render(Deferred);

        Assert.True(cut.Find("pk-table").HasAttribute("loading"));
        Assert.Equal("[]", cut.Find("pk-table").GetAttribute("rows"));
        Assert.Empty(cut.FindAll("pk-pagination"));

        _pending[0].SetResult(Page(1, "Ada"));
        cut.WaitForAssertion(() => Assert.False(cut.Find("pk-table").HasAttribute("loading")));
        Assert.Contains("Ada", cut.Find("pk-table").GetAttribute("rows"));
    }

    [Fact]
    public void The_search_box_debounces_itself_and_is_clearable()
    {
        var cut = Render(Immediate(_ => Page(0)), p => p.Add(x => x.SearchDebounceMs, 450));
        var input = cut.Find("pk-input");

        Assert.Equal("search", input.GetAttribute("type"));
        Assert.Equal("450", input.GetAttribute("debounce"));
        Assert.True(input.HasAttribute("clearable"));
    }

    [Fact]
    public async Task A_search_goes_back_to_page_1_and_clearing_it_loads_the_full_list_again()
    {
        var cut = Render(Immediate(_ => Page(100, "Ada")));
        await cut.Find("pk-pagination").TriggerEventAsync("onpk-page", new PkPageEventArgs { Page = 3 });
        Assert.Equal(3, _requests.Last().Page);

        await Search(cut, " grace ");
        Assert.Equal(new PkListRequest("grace", null, false, 1, 25), Plain(_requests.Last()));

        await Search(cut, "");
        Assert.Equal(new PkListRequest(null, null, false, 1, 25), Plain(_requests.Last()));
        Assert.Equal(4, _requests.Count);   // load, page 3, search, clear
    }

    [Fact]
    public async Task A_sort_re_queries_page_1_in_that_order_and_the_header_reflects_it()
    {
        var cut = Render(Immediate(_ => Page(100, "Ada")));
        await cut.Find("pk-pagination").TriggerEventAsync("onpk-page", new PkPageEventArgs { Page = 2 });

        await cut.Find("pk-table").TriggerEventAsync("onpk-sort", new PkSortEventArgs { Key = "city", Direction = "descending" });

        Assert.Equal(new PkListRequest(null, "city", true, 1, 25), Plain(_requests.Last()));
        Assert.Equal("city", cut.Find("pk-table").GetAttribute("sort"));
        Assert.Equal("descending", cut.Find("pk-table").GetAttribute("sort-dir"));
    }

    [Fact]
    public async Task Changing_the_page_size_resets_to_page_1()
    {
        var cut = Render(Immediate(_ => Page(500, "Ada")));
        await cut.Find("pk-pagination").TriggerEventAsync("onpk-page", new PkPageEventArgs { Page = 4 });

        await cut.Find("pk-pagination").TriggerEventAsync("onpk-page-size", new PkPageSizeEventArgs { PageSize = 50 });

        Assert.Equal(new PkListRequest(null, null, false, 1, 50), Plain(_requests.Last()));
        Assert.Equal("50", cut.Find("pk-pagination").GetAttribute("page-size"));
    }

    [Fact]
    public async Task A_newer_request_cancels_the_older_one_and_the_older_result_is_dropped()
    {
        var cut = Render(Deferred);
        _pending[0].SetResult(Page(10, "First"));
        cut.WaitForAssertion(() => Assert.False(cut.Find("pk-table").HasAttribute("loading")));

        var first = Search(cut, "a");      // request 1, in flight (the event task ends when Load does, so it is not awaited yet)
        var second = Search(cut, "ab");    // request 2 replaces it
        cut.WaitForState(() => _pending.Count == 3);
        Assert.True(_requests[1].CancellationToken.IsCancellationRequested);
        Assert.False(_requests[2].CancellationToken.IsCancellationRequested);

        _pending[2].SetResult(Page(1, "Newest"));            // the newer answers first
        cut.WaitForAssertion(() => Assert.Contains("Newest", cut.Find("pk-table").GetAttribute("rows")));
        _pending[1].SetResult(Page(1, "Stale"));             // the older one arrives late
        cut.WaitForAssertion(() => Assert.DoesNotContain("Stale", cut.Markup));
        Assert.Contains("Newest", cut.Find("pk-table").GetAttribute("rows"));
        Assert.False(cut.Find("pk-table").HasAttribute("loading"));
        await Task.WhenAll(first, second);
    }

    [Fact]
    public async Task A_cancelled_request_that_throws_is_not_an_error()
    {
        var cut = Render(Deferred);
        _pending[0].SetResult(Page(1, "Ada"));
        cut.WaitForAssertion(() => Assert.False(cut.Find("pk-table").HasAttribute("loading")));

        var first = Search(cut, "x");
        var second = Search(cut, "y");                      // supersedes the first search
        cut.WaitForState(() => _pending.Count == 3);
        _pending[1].SetCanceled(_requests[1].CancellationToken);   // a database call throws OperationCanceledException like this
        _pending[2].SetResult(Page(1, "Back"));

        cut.WaitForAssertion(() => Assert.Contains("Back", cut.Find("pk-table").GetAttribute("rows")));
        Assert.Empty(cut.FindAll("pk-alert"));
        await Task.WhenAll(first, second);
    }

    [Fact]
    public async Task When_the_total_shrinks_under_the_current_page_it_settles_on_the_last_page_and_reloads()
    {
        var total = 100;
        var cut = Render(Immediate(r => Page(total, "P" + r.Page)), p => p.Add(x => x.PageSize, 10));
        await cut.Find("pk-pagination").TriggerEventAsync("onpk-page", new PkPageEventArgs { Page = 10 });
        Assert.Equal(10, _requests.Last().Page);
        var before = _requests.Count;

        total = 25;                                   // rows were deleted elsewhere
        await cut.InvokeAsync(() => cut.Instance.ReloadAsync());

        Assert.Equal([10, 3], _requests.Skip(before).Select(r => r.Page));
        Assert.Equal("3", cut.Find("pk-pagination").GetAttribute("page"));
        Assert.Contains("P3", cut.Find("pk-table").GetAttribute("rows"));
    }

    [Fact]
    public void An_empty_list_says_so_and_has_no_pager()
    {
        var cut = Render(Immediate(_ => Page(0)), p => p.Add(x => x.EmptyText, "No customers yet"));

        Assert.Equal("No customers yet", cut.Find("pk-table").GetAttribute("empty-text"));
        Assert.Empty(cut.FindAll("pk-pagination"));
    }

    [Fact]
    public async Task A_search_with_no_match_uses_the_no_results_text()
    {
        var cut = Render(Immediate(r => r.Search is null ? Page(3, "Ada") : Page(0)));

        await Search(cut, "zzz");

        Assert.Equal("Nothing matches your search.", cut.Find("pk-table").GetAttribute("empty-text"));
    }

    [Fact]
    public async Task A_row_click_reports_the_item_and_the_first_column_is_a_link_that_does_too()
    {
        Customer? opened = null;
        var cut = Render(Immediate(_ => Page(2, "Ada", "Grace")), p => p.Add(x => x.OnRowClick, c => opened = c));
        Assert.True(cut.Find("pk-table").HasAttribute("clickable"));

        await cut.Find("pk-table").TriggerEventAsync("onpk-row-click", new PkRowClickEventArgs { Id = "2" });
        Assert.Equal("Grace", opened!.Name);

        opened = null;
        await cut.Find("[slot=cell-1-name] a").ClickAsync(new());
        Assert.Equal("Ada", opened!.Name);
    }

    [Fact]
    public void Without_OnRowClick_rows_are_not_clickable_and_the_current_row_is_marked()
    {
        var plain = Render(Immediate(_ => Page(2, "Ada", "Grace")));
        Assert.False(plain.Find("pk-table").HasAttribute("clickable"));
        Assert.Empty(plain.FindAll("[slot^=cell-]"));

        var cut = Render(Immediate(_ => Page(2, "Ada", "Grace")), p => p.Add(x => x.CurrentId, "2"));
        Assert.Empty(cut.FindAll("[slot=cell-1-name] [aria-current]"));
        var current = cut.Find("[slot=cell-2-name] [aria-current]");
        Assert.Equal("true", current.GetAttribute("aria-current"));
        Assert.Equal("Grace", current.QuerySelector("strong")!.TextContent);
    }

    [Fact]
    public async Task The_add_button_and_ReloadAsync_work_and_extra_toolbar_content_is_kept()
    {
        var added = 0;
        var cut = Render(Immediate(_ => Page(1, "Ada")), p => p
            .Add(x => x.AddLabel, "+ Add customer")
            .Add(x => x.OnAdd, () => added++)
            .Add(x => x.ToolbarContent, b => b.AddMarkupContent(0, "<i id=extra></i>")));

        await cut.Find("pk-button").ClickAsync(new());
        Assert.Equal(1, added);
        Assert.Equal("+ Add customer", cut.Find("pk-button").TextContent);
        Assert.NotNull(cut.Find("#extra"));

        var before = _requests.Count;
        await cut.InvokeAsync(() => cut.Instance.ReloadAsync());
        Assert.Equal(before + 1, _requests.Count);
        Assert.Equal(_requests[before - 1] with { CancellationToken = default }, _requests[before] with { CancellationToken = default });
    }

    [Fact]
    public async Task A_failed_load_shows_an_error_with_retry_and_reports_it()
    {
        var fail = true;
        Exception? reported = null;
        var cut = Render(Immediate(_ => fail ? throw new InvalidOperationException("db down") : Page(1, "Ada")), p => p.Add(x => x.OnLoadError, e => reported = e));

        Assert.Equal("db down", reported!.Message);
        Assert.Contains("could not be loaded", cut.Find("pk-alert").OuterHtml);
        Assert.False(cut.Find("pk-table").HasAttribute("loading"));

        fail = false;
        await cut.Find("[slot=empty] pk-button").ClickAsync(new());
        cut.WaitForAssertion(() => Assert.Contains("Ada", cut.Find("pk-table").GetAttribute("rows")));
        Assert.Empty(cut.FindAll("pk-alert"));
    }

    [Fact]
    public void Initial_page_size_and_sort_are_used_for_the_first_request()
    {
        Render(Immediate(_ => Page(0)), p => p.Add(x => x.PageSize, 50).Add(x => x.SortKey, "name").Add(x => x.Descending, true));

        Assert.Equal(new PkListRequest(null, "name", true, 1, 50), Plain(_requests.Single()));
    }
}
