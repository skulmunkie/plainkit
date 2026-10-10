using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 366: PkToolPage.Run and PkSettingsPage.Save are the elements' run/save callback properties. The component hands the element a .NET
// reference through the bridge (setCallback); calling it runs the delegate with the element's values.
public sealed class PkPageCallbackTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkPageCallbackTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static Dictionary<string, JsonElement> Values(string json) => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void ToolPage_sends_config_and_label_and_sets_no_callback_without_Run()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Config, "{\"outcome\":\"text\"}").Add(x => x.RunLabel, "Count"));

        var el = cut.Find("pk-tool-page");
        Assert.Equal("{\"outcome\":\"text\"}", el.GetAttribute("config"));
        Assert.Equal("Count", el.GetAttribute("run-label"));
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task ToolPage_run_reaches_the_delegate_with_the_field_values_and_returns_its_result()
    {
        IReadOnlyDictionary<string, JsonElement>? seen = null;
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, v => { seen = v; return Task.FromResult<object?>(new { value = 3, label = "Words" }); }));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
        Assert.Equal("run", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"text\":\"a b c\",\"n\":2}")));

        Assert.Equal("a b c", seen!["text"].GetString());
        Assert.Equal(2, seen["n"].GetInt32());
        Assert.Equal(3, JsonSerializer.SerializeToElement(result).GetProperty("value").GetInt32());
    }

    [Fact]
    public async Task ToolPage_run_that_throws_faults_the_call_so_the_element_shows_its_error_state()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, _ => throw new InvalidOperationException("boom")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => cut.InvokeAsync(() => host.Value.Invoke(Values("{}"))));
        Assert.Equal("boom", e.Message);
    }

    [Fact]
    public async Task ToolPage_clears_the_callback_when_Run_is_removed_and_releases_the_reference_on_dispose()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, _ => Task.FromResult<object?>("ok")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        cut.Render(p => p.Add<Func<IReadOnlyDictionary<string, JsonElement>, Task<object?>>?>(x => x.Run, null));
        Assert.Equal(2, _bridge.Invocations["setCallback"].Count);
        Assert.Null(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        Assert.Throws<ObjectDisposedException>(() => host.Value);

        // and once more set, then disposed with the component
        cut.Render(p => p.Add(x => x.Run, _ => Task.FromResult<object?>("ok")));
        var again = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => again.Value);
    }

    [Fact]
    public async Task SettingsPage_save_reaches_the_delegate_and_returns_nothing()
    {
        IReadOnlyDictionary<string, JsonElement>? saved = null;
        var cut = Render<PkSettingsPage>(p => p.Add(x => x.Values, "{\"density\":\"cozy\"}").Add(x => x.Save, v => { saved = v; return Task.CompletedTask; }));

        Assert.Equal("{\"density\":\"cozy\"}", cut.Find("pk-settings-page").GetAttribute("values"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("save", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<Dictionary<string, JsonElement>>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"density\":\"compact\",\"beta\":true}")));

        Assert.Null(result);
        Assert.Equal("compact", saved!["density"].GetString());
        Assert.True(saved["beta"].GetBoolean());
    }

    private sealed record Order(string OrderNo, int Total);

    [Fact]
    public async Task ListPage_load_gets_the_query_as_a_request_and_returns_rows_and_total()
    {
        PkListRequest? seen = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Config, "{\"columns\":[{\"key\":\"orderNo\",\"label\":\"No\"}]}")
            .Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([new("A-1", 5)], 41)); }));

        Assert.Contains("orderNo", cut.Find("pk-list-page").GetAttribute("config"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("load", call.Arguments[1]);
        Assert.Equal(true, call.Arguments[3]);   // a list that drew its empty state before the callback existed redraws (or, not yet defined, loads when it upgrades)
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(call.Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"page\":3,\"pageSize\":10,\"sort\":\"total\",\"sortDir\":\"descending\",\"search\":\" ab \",\"filters\":{\"status\":\"open\"}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var result = await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal(new PkListRequest("ab", "total", true, 3, 10), seen! with { Filters = null });
        Assert.Equal("open", seen.Filters!["status"]);
        Assert.Equal(20, seen.Skip);
        var json = JsonSerializer.SerializeToElement(result);
        Assert.Equal(41, json.GetProperty("total").GetInt32());
        Assert.Equal("A-1", json.GetProperty("rows")[0].GetProperty("OrderNo").GetString());
    }

    [Fact]
    public async Task ListPage_load_gets_a_multiselect_filter_as_a_list_and_a_text_filter_as_text()
    {
        PkListRequest? seen = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"status\":\"open\",\"region\":[\"north\",\"south\"],\"none\":[]}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal("open", Assert.Single(seen!.Filters!).Value);
        Assert.Equal(["north", "south"], seen.MultiFilters!["region"]);
        Assert.Empty(seen.MultiFilters["none"]);
    }

    [Fact]
    public async Task DataTable_load_gets_a_multiselect_filter_in_MultiFilters_and_a_text_filter_in_Filters()
    {
        PkListRequest? seen = null;
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"status\":[\"open\",\"paused\"],\"owner\":\"ada\",\"status\":\"closed\"}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal("ada", seen!.Filters!["owner"]);
        Assert.Equal("closed", seen.Filters["status"]);   // a key sent twice: the last value wins (JSON object), so it is in one dictionary only
        Assert.Null(seen.MultiFilters);
    }

    [Fact]
    public async Task DataTable_load_gets_an_array_filter_as_a_list()
    {
        PkListRequest? seen = null;
        var cut = Render<PkDataTable<Order>>(p => p.Add(x => x.IdOf, o => o.OrderNo)
            .Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        var query = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"status\":[\"open\",\"paused\"],\"owner\":\"ada\"}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        await cut.InvokeAsync(() => host.Value.Invoke(query));

        Assert.Equal("ada", seen!.Filters!["owner"]);
        Assert.Equal(["open", "paused"], seen.MultiFilters!["status"]);
    }

    [Fact]
    public void A_query_with_only_array_filters_has_no_text_Filters()
    {
        var request = JsonSerializer.Deserialize<PkListPageQuery>("{\"filters\":{\"tag\":[\"a\"]}}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!.ToRequest();

        Assert.Null(request.Filters);
        Assert.Equal(["a"], request.MultiFilters!["tag"]);
    }

    [Fact]
    public async Task ListPage_default_query_is_page_one_with_no_search_sort_or_filters()
    {
        PkListRequest? seen = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, r => { seen = r; return Task.FromResult(new PkListResult<Order>([], 0)); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);
        await cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery(Sort: "", Search: "  ")));

        Assert.Null(seen!.Search);
        Assert.Null(seen.SortKey);
        Assert.False(seen.Descending);
        Assert.Equal(1, seen.Page);
        Assert.Null(seen.Filters);
    }

    [Fact]
    public void ListPage_sets_no_callback_without_Load()
    {
        Render<PkListPage<Order>>();
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task ListPage_load_that_throws_faults_the_call_so_the_element_shows_its_error_state()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, _ => throw new InvalidOperationException("db down")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => cut.InvokeAsync(() => host.Value.Invoke(new PkListPageQuery())));
        Assert.Equal("db down", e.Message);
    }

    [Fact]
    public async Task ListPage_clears_the_callback_when_Load_is_removed_and_releases_the_reference_on_dispose()
    {
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Load, _ => Task.FromResult(new PkListResult<Order>([], 0))));
        var first = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        cut.Render(p => p.Add<Func<PkListRequest, Task<PkListResult<Order>>>?>(x => x.Load, null));
        Assert.Null(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        Assert.Throws<ObjectDisposedException>(() => first.Value);

        cut.Render(p => p.Add(x => x.Load, _ => Task.FromResult(new PkListResult<Order>([], 0))));
        var again = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => again.Value);
    }

    [Fact]
    public async Task ListPage_passes_selection_and_bulk_actions_to_OnSelect_and_OnBulk()
    {
        PkSelectEventArgs? selected = null; PkBulkEventArgs? bulk = null;
        var cut = Render<PkListPage<Order>>(p => p.Add(x => x.Config, "{\"selectable\":true,\"bulkActions\":[{\"id\":\"archive\",\"label\":\"Archive\"}]}")
            .Add(x => x.OnSelect, e => { selected = e; })
            .Add(x => x.OnBulk, e => { bulk = e; }));
        var query = JsonDocument.Parse("{\"page\":2,\"pageSize\":10,\"search\":\"ab\"}").RootElement.Clone();

        await cut.Find("pk-list-page").TriggerEventAsync("onpk-select", new PkSelectEventArgs { Selected = ["A-1", "A-2"], Scope = "all", Query = query });
        await cut.Find("pk-list-page").TriggerEventAsync("onpk-bulk", new PkBulkEventArgs { Action = "archive", Selected = ["A-1"], Scope = "page", Query = query });

        Assert.Equal(["A-1", "A-2"], selected!.Selected!);
        Assert.Equal("all", selected.Scope);
        Assert.Equal("ab", selected.ToRequest()!.Search);
        Assert.Equal("archive", bulk!.Action);
        Assert.Equal(["A-1"], bulk.Selected!);
    }
}
