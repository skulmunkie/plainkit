using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// PkLookupPicker<TItem> (issue #801 step 8): a typed wrapper over pk-lookup-picker. The element owns the popup, the table and the selection, so these tests
// play the element: they call the load and resolve callbacks the component handed to the bridge and raise the element's events.
public sealed class PkLookupPickerTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Customer(int Id, string Name, string City);

    private static readonly PkTableColumn<Customer>[] Columns =
    [
        new() { Key = "Name", Label = "Name" },
        new() { Key = "city", Label = "City", Text = c => c.City.ToUpperInvariant() },
    ];

    private readonly BunitJSModuleInterop _bridge;

    public PkLookupPickerTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private IRenderedComponent<PkLookupPicker<Customer>> Render(Action<ComponentParameterCollectionBuilder<PkLookupPicker<Customer>>>? more = null) =>
        Render<PkLookupPicker<Customer>>(p =>
        {
            p.Add(x => x.Load, r => Task.FromResult(new PkListResult<Customer>([new(1, "Acme", "Leeds"), new(2, "Globex", "Oslo")], 12)));
            p.Add(x => x.Columns, Columns).Add(x => x.IdOf, c => c.Id.ToString()).Add(x => x.LabelOf, c => c.Name);
            more?.Invoke(p);
        });

    private object CallbackRef(string name) => _bridge.Invocations["setCallback"].Single(i => (string)i.Arguments[1]! == name).Arguments[2]!;

    [Fact]
    public void It_renders_pk_lookup_picker_with_columns_as_config_and_the_options_as_attributes()
    {
        var cut = Render(p => p.Add(x => x.Value, "2").Add(x => x.Name, "customer").Add(x => x.Placeholder, "Choose").Add(x => x.AriaLabel, "Customer").Add(x => x.Required, true)
            .Add(x => x.SelectedLabels, new Dictionary<string, string> { ["2"] = "Globex" }));
        var el = cut.Find("pk-lookup-picker");
        using var config = JsonDocument.Parse(el.GetAttribute("config")!);
        Assert.Equal(["Name", "city"], config.RootElement.GetProperty("columns").EnumerateArray().Select(x => x.GetProperty("key").GetString()));
        Assert.Equal("Search Customer", config.RootElement.GetProperty("searchLabel").GetString());
        Assert.Equal(("2", "customer", "Choose", "Customer", "id", "pkLabel"), (el.GetAttribute("value"), el.GetAttribute("name"), el.GetAttribute("placeholder"), el.GetAttribute("label"), el.GetAttribute("row-key"), el.GetAttribute("label-key")));
        Assert.True(el.HasAttribute("required")); Assert.False(el.HasAttribute("multiple"));
        Assert.Equal("{\"2\":\"Globex\"}", el.GetAttribute("selected-labels"));
    }

    [Fact]
    public async Task The_load_callback_answers_rows_with_the_key_and_the_label_and_the_total()
    {
        var cut = Render();
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkListPageQuery>>>(CallbackRef("load")).Value;
        var answer = JsonSerializer.SerializeToElement(await cut.InvokeAsync(() => host.Invoke(new PkListPageQuery(1, 10, null, null, "a"))));
        Assert.Equal(12, answer.GetProperty("total").GetInt32());
        var rows = answer.GetProperty("rows").EnumerateArray().ToList();
        Assert.Equal(("1", "Acme", "LEEDS"), (rows[0].GetProperty("id").GetString(), rows[0].GetProperty("pkLabel").GetString(), rows[0].GetProperty("city").GetString()));
    }

    [Fact]
    public async Task The_resolve_callback_is_set_only_with_Resolve_and_gets_the_keys()
    {
        Assert.DoesNotContain(_bridge.Invocations["setCallback"], i => (string)i.Arguments[1]! == "resolve");
        IReadOnlyList<string>? asked = null;
        var cut = Render(p => p.Add(x => x.Resolve, keys => { asked = keys; return Task.FromResult<IReadOnlyDictionary<string, string>>(new Dictionary<string, string> { ["9"] = "Nine" }); }));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string[]>>>(CallbackRef("resolve")).Value;
        var answer = JsonSerializer.SerializeToElement(await cut.InvokeAsync(() => host.Invoke(["9"])));
        Assert.Equal(["9"], asked); Assert.Equal("Nine", answer.GetProperty("9").GetString());
    }

    [Fact]
    public async Task The_elements_events_come_back_as_Value_Values_and_Open()
    {
        string? value = null; IReadOnlyList<string>? values = null; var open = false;
        var cut = Render(p => p.Add(x => x.Multiple, true).Add(x => x.Max, 3)
            .Add(x => x.ValueChanged, v => value = v).Add(x => x.ValuesChanged, v => values = v).Add(x => x.OpenChanged, o => open = o));
        var el = cut.Find("pk-lookup-picker");
        Assert.True(el.HasAttribute("multiple")); Assert.Equal("3", el.GetAttribute("max"));
        await el.TriggerEventAsync("onpk-lookup-select", new PkLookupSelectEventArgs { Value = "2" });
        await el.TriggerEventAsync("onpk-values-change", new PkValuesChangeEventArgs { Values = ["1", "2"] });
        await el.TriggerEventAsync("onpk-lookup-toggle", new PkLookupToggleEventArgs { Open = true });
        Assert.Equal("2", value); Assert.Equal(["1", "2"], values); Assert.True(open);
        Assert.Equal("[\"1\",\"2\"]", cut.Find("pk-lookup-picker").GetAttribute("values"));
    }
}
