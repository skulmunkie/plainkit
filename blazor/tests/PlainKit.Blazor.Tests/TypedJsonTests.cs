using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Config/Values/Errors/State take JSON text or a typed value (issue #1417): the generated component serialises a record or dictionary camelCase with nulls skipped.
public sealed class TypedJsonTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public TypedJsonTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private sealed record Group(string Heading, bool? Collapsed = null, string? Hint = null);
    private sealed record Cfg(List<Group> Groups);

    [Fact]
    public void A_record_config_is_serialised_camel_case_and_skips_nulls()
    {
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.Config, new Cfg([new Group("Look", true)])));
        Assert.Equal("{\"groups\":[{\"heading\":\"Look\",\"collapsed\":true}]}", cut.Find("pk-property-grid").GetAttribute("config"));
    }

    [Fact]
    public void A_dictionary_keeps_its_keys_as_written()
    {
        var cut = Render<PkPropertyGrid>(p => p
            .Add(x => x.Values, new Dictionary<string, object?> { ["FontSize"] = 14, ["theme"] = "dark", ["Gone"] = null })
            .Add(x => x.Errors, new Dictionary<string, string> { ["FontSize"] = "Too big" }));
        Assert.Equal("{\"FontSize\":14,\"theme\":\"dark\",\"Gone\":null}", cut.Find("pk-property-grid").GetAttribute("values"));
        Assert.Equal("{\"FontSize\":\"Too big\"}", cut.Find("pk-property-grid").GetAttribute("errors"));
    }

    [Fact]
    public void A_raw_json_string_passes_through_unchanged()
    {
        const string json = "{\"groups\":[]}";
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.Config, json));
        Assert.Equal(json, cut.Find("pk-property-grid").GetAttribute("config"));
    }

    [Fact]
    public void A_json_element_and_the_default_are_sent_as_text()
    {
        using var doc = JsonDocument.Parse("{\"a\":1}");
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.State, doc.RootElement.Clone()));
        Assert.Equal("{\"a\":1}", cut.Find("pk-property-grid").GetAttribute("state"));
        Assert.Equal("{}", cut.Find("pk-property-grid").GetAttribute("errors"));
    }

    [Fact]
    public void A_new_but_equal_record_does_not_change_the_attribute()
    {
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.Config, new Cfg([new Group("Look")])));
        var before = cut.Markup;
        cut.Render(p => p.Add(x => x.Config, new Cfg([new Group("Look")])));
        Assert.Equal(before, cut.Markup);
        cut.Render(p => p.Add(x => x.Config, new Cfg([new Group("Feel")])));
        Assert.Equal("{\"groups\":[{\"heading\":\"Feel\"}]}", cut.Find("pk-property-grid").GetAttribute("config"));
    }

    [Fact]
    public void A_page_type_takes_a_typed_config_too()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Config, new { Title = "Run", Hint = (string?)null }));
        Assert.Equal("{\"title\":\"Run\"}", cut.Find("pk-tool-page").GetAttribute("config"));
    }

    [Fact]
    public async Task Bind_values_still_round_trips_the_raw_json_text()
    {
        var values = "{\"a\":1}";
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.Values, values).Add(x => x.ValuesChanged, EventCallback.Factory.Create<string?>(this, v => values = v!)));
        using var doc = JsonDocument.Parse("{\"a\":2}");
        await cut.Find("pk-property-grid").TriggerEventAsync("onpk-property-change", new PkPropertyChangeEventArgs { Values = doc.RootElement.Clone() });
        Assert.Equal("{\"a\":2}", values);
        Assert.Equal("{\"a\":2}", cut.Find("pk-property-grid").GetAttribute("values"));
    }
}
