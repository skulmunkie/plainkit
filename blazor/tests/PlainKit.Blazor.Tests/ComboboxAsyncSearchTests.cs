using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 652: PkCombobox as an async search box. pk-combo-query reaches OnSearchInput, the host answers by re-rendering the option children, a pick
// reaches @bind-Value, and a name set by the page (Splat) is kept so the form submits the value.
public sealed class ComboboxAsyncSearchTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public ComboboxAsyncSearchTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    // Issue 1687: Clearable is the element's clearable attribute; clearing is the element's pk-combo-select with an empty value, which @bind-Value takes.
    [Fact]
    public async Task Clearable_reaches_the_element_and_an_empty_select_reaches_bind_value()
    {
        string? value = "a";
        var cut = Render<PkCombobox>(p => p.Add(x => x.Clearable, true).Bind(x => x.Value, value, v => value = v));
        Assert.True(cut.Find("pk-combobox").HasAttribute("clearable"));
        await cut.Find("pk-combobox").TriggerEventAsync("onpk-combo-select", new PkComboSelectEventArgs { Value = "" });
        Assert.Equal("", value);
    }

    // Issue 1664: DebounceMs is the element's debounce property (the wait happens in the element, so the callback is raised once per pause).
    [Fact]
    public void DebounceMs_is_sent_to_the_element()
    {
        var cut = Render<PkCombobox>(p => p.Add(x => x.DebounceMs, 250));
        Assert.Equal("250", cut.Find("pk-combobox").GetAttribute("debounce"));
    }

    [Fact]
    public async Task The_query_reaches_the_callback_the_host_replaces_the_options_and_a_pick_reaches_bind_value()
    {
        var options = new List<string> { "Seed" };
        string? query = null, value = null;
        var cut = Render<PkCombobox>(p => p
            .Add(x => x.Filtering, ComboboxFiltering.Off)
            .Add(x => x.OnSearchInput, EventCallback.Factory.Create<PkComboQueryEventArgs>(this, e => query = e.Query))
            .Bind(x => x.Value, value, v => value = v)
            .AddUnmatched("name", "customer")
            .AddChildContent(b => { foreach (var o in options) { b.OpenElement(0, "option"); b.AddAttribute(1, "value", o); b.AddContent(2, o); b.CloseElement(); } }));

        await cut.Find("pk-combobox").TriggerEventAsync("onpk-combo-query", new PkComboQueryEventArgs { Query = "ab" });
        Assert.Equal("ab", query);
        Assert.Equal("customer", cut.Find("pk-combobox").GetAttribute("name"));

        options.Clear(); options.AddRange(["Alpha", "Abacus"]);
        cut.Render(); // the host re-renders after its async search answered
        Assert.Equal(["Alpha", "Abacus"], cut.FindAll("pk-combobox option").Select(o => o.TextContent).ToArray());

        await cut.Find("pk-combobox").TriggerEventAsync("onpk-combo-select", new PkComboSelectEventArgs { Value = "Abacus" });
        Assert.Equal("Abacus", value);
    }

    // Issue 1664: OnSearch is the element's search callback property (PkCallbackSlot): the text goes in, the options come back as { value, label } and
    // the element's abort cancels the token (the element drops a stale answer; no guard lives in the wrapper).
    [Fact]
    public async Task OnSearch_runs_through_the_callback_slot_with_a_token_the_element_can_cancel()
    {
        CancellationToken seen = default;
        var cut = Render<PkCombobox>(p => p.Add(x => x.OnSearch, (q, ct) => { seen = ct; return Task.FromResult<IReadOnlyList<PkFieldOption>>([new PkFieldOption("1", q + "!")]); }));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("search", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string>>>(call.Arguments[2]);

        var result = System.Text.Json.JsonSerializer.Serialize(await cut.InvokeAsync(() => host.Value.Invoke("ab", 7)));
        Assert.Equal("[{\"value\":\"1\",\"label\":\"ab!\"}]", result);
        Assert.False(seen.IsCancellationRequested);

        var pending = new TaskCompletionSource<IReadOnlyList<PkFieldOption>>();
        cut.Render(p => p.Add(x => x.OnSearch, (q, ct) => { seen = ct; return pending.Task; }));
        var running = cut.InvokeAsync(() => host.Value.Invoke("abc", 8));
        host.Value.Cancel(8);
        Assert.True(seen.IsCancellationRequested);
        pending.SetCanceled();
        await Assert.ThrowsAsync<TaskCanceledException>(() => running);
    }

    [Fact]
    public void Without_OnSearch_no_callback_is_set()
    {
        Render<PkCombobox>();
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }
}
