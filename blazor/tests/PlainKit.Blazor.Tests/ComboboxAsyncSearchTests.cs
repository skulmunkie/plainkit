using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 652: PkCombobox as an async search box. pk-combo-query reaches OnSearchInput, the host answers by re-rendering the option children, a pick
// reaches @bind-Value, and a name set by the page (Splat) is kept so the form submits the value.
public sealed class ComboboxAsyncSearchTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public ComboboxAsyncSearchTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task The_query_reaches_the_callback_the_host_replaces_the_options_and_a_pick_reaches_bind_value()
    {
        var options = new List<string> { "Seed" };
        string? query = null, value = null;
        var cut = Render<PkCombobox>(p => p
            .Add(x => x.Filtering, "off")
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
}
