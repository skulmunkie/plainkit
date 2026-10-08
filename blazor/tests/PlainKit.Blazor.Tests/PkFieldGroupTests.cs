using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;
using PlainKit.Blazor.Components;

namespace PlainKit.Blazor.Tests;

// Issues 222 and 226: PkFieldGroup<TItem> is the typed adapter over the generated PkFieldGroup (the pk-field-group element). The element owns the controls, the conditional
// rendering, the form value and the validation, so these tests check what the adapter sends it (the fields and values as data) and what it writes back, and play the element
// for the events and the search callback.
public sealed class PkFieldGroupTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkFieldGroupTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private sealed class Order
    {
        public string Name { get; set; } = "";
        public int Qty { get; set; }
        public bool Active { get; set; }
        public string Status { get; set; } = "";
    }

    private static PkFieldSpec<Order>[] Fields() =>
    [
        new() { Key = "name", Label = "Name", Hint = "Full name", Required = true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        new() { Key = "qty", Label = "Quantity", Kind = PkFieldKind.Number, Min = "1", Max = "99", Step = "1", Get = o => o.Qty.ToString(), Set = (o, v) => o.Qty = int.Parse(v ?? "0") },
        new() { Key = "active", Label = "Active", Kind = PkFieldKind.Checkbox, Get = o => o.Active ? "true" : "", Set = (o, v) => o.Active = v == "true" },
        new() { Key = "status", Label = "Status", Kind = PkFieldKind.Select, Options = [new("open", "Open"), new("closed", "Closed")], Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" },
    ];

    private IRenderedComponent<PkFieldGroup<Order>> Render(IReadOnlyList<PkFieldSpec<Order>> fields, Order? model = null, EventCallback? changed = null) =>
        Render<PkFieldGroup<Order>>(p =>
        {
            p.Add(x => x.Fields, fields).Add(x => x.Model, model ?? new Order());
            if (changed is { } c) p.Add(x => x.ModelChanged, c);
        });

    // The element's `fields` and `values` attributes, as the element reads them.
    private static JsonElement[] Defs(IRenderedComponent<PkFieldGroup<Order>> cut) => cut.Markup.Length < 0 ? [] : JsonDocument.Parse(cut.Find("pk-field-group").GetAttribute("fields")!).RootElement.EnumerateArray().Select(e => e.Clone()).ToArray();
    private static JsonElement ValuesOf(IRenderedComponent<PkFieldGroup<Order>> cut) => JsonDocument.Parse(cut.Find("pk-field-group").GetAttribute("values")!).RootElement.Clone();

    [Fact]
    public void The_specs_become_the_elements_fields_and_the_model_its_values()
    {
        var cut = Render(Fields(), new Order { Name = "Acme", Qty = 3, Active = true, Status = "open" });

        
        var d = Defs(cut);
        Assert.Equal(["name", "qty", "active", "status"], d.Select(x => x.GetProperty("key").GetString()!).ToArray());
        Assert.Equal("Name", d[0].GetProperty("label").GetString()); Assert.Equal("Full name", d[0].GetProperty("hint").GetString()); Assert.True(d[0].GetProperty("required").GetBoolean());
        Assert.Equal("number", d[1].GetProperty("kind").GetString());
        Assert.Equal("1", d[1].GetProperty("min").GetString()); Assert.Equal("99", d[1].GetProperty("max").GetString()); Assert.Equal("1", d[1].GetProperty("step").GetString());
        Assert.Equal("checkbox", d[2].GetProperty("kind").GetString());
        Assert.Equal("select", d[3].GetProperty("kind").GetString());
        Assert.Equal(["open", "closed"], d[3].GetProperty("options").EnumerateArray().Select(o => o.GetProperty("value").GetString()!).ToArray());
        Assert.Equal("Open", d[3].GetProperty("options")[0].GetProperty("label").GetString());

        var v = ValuesOf(cut);
        Assert.Equal("Acme", v.GetProperty("name").GetString()); Assert.Equal("3", v.GetProperty("qty").GetString()); Assert.Equal("open", v.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.True, v.GetProperty("active").ValueKind);
        Assert.Equal(JsonValueKind.False, ValuesOf(Render(Fields())).GetProperty("active").ValueKind);
    }

    [Fact]
    public async Task A_committed_value_calls_Set_on_the_model_and_raises_ModelChanged()
    {
        var order = new Order();
        var changed = 0;
        var cut = Render(Fields(), order, EventCallback.Factory.Create(this, () => changed++));
        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "name", Value = JsonSerializer.SerializeToElement("Ada") });
        Assert.Equal("Ada", order.Name); Assert.Equal(1, changed);

        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "active", Value = JsonSerializer.SerializeToElement(true) });
        Assert.True(order.Active);
        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "active", Value = JsonSerializer.SerializeToElement(false) });
        Assert.False(order.Active);
        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "qty", Value = JsonSerializer.SerializeToElement("7") });
        Assert.Equal(7, order.Qty);
        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "nobody", Value = JsonSerializer.SerializeToElement("x") });
        Assert.Equal(4, changed);
    }

    // Issue 226: a field whose When is false is not sent at all (the element renders no markup for it, so a hidden required field has nothing to validate).
    private static PkFieldSpec<Order>[] WithConditionalNote() =>
    [
        new() { Key = "status", Label = "Status", Kind = PkFieldKind.Select, Options = [new("open", "Open"), new("closed", "Closed")], Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" },
        new() { Key = "name", Label = "Closing note", Required = true, When = o => o.Status == "closed", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
    ];

    [Fact]
    public async Task A_field_whose_When_is_false_is_not_sent_and_one_whose_gate_flips_is_sent_on_the_next_render()
    {
        var order = new Order { Status = "open", Name = "kept" };
        var cut = Render(WithConditionalNote(), order, EventCallback.Factory.Create(this, () => { }));
        Assert.Equal(["status"], Defs(cut).Select(x => x.GetProperty("key").GetString()!).ToArray());
        Assert.False(ValuesOf(cut).TryGetProperty("name", out _));

        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "status", Value = JsonSerializer.SerializeToElement("closed") });
        cut.Render();
        var d = Defs(cut);
        Assert.Equal(["status", "name"], d.Select(x => x.GetProperty("key").GetString()!).ToArray());
        Assert.True(d[1].GetProperty("required").GetBoolean());
        Assert.Equal("kept", ValuesOf(cut).GetProperty("name").GetString());
    }

    [Fact]
    public void Disabled_ReadOnly_and_the_help_text_are_read_from_the_model_on_every_render()
    {
        PkFieldSpec<Order>[] fields =
        [
            new() { Key = "a", Label = "A", Disabled = o => o.Qty > 0, ReadOnly = o => o.Active, Help = "Why", HelpWhen = o => o.Qty > 0 ? "Locked" : null, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "s", Label = "S", Kind = PkFieldKind.Select, ReadOnly = o => true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "c", Label = "C", Kind = PkFieldKind.Checkbox, ReadOnly = o => true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        ];
        var open = Defs(Render(fields, new Order()));
        Assert.False(open[0].GetProperty("disabled").GetBoolean()); Assert.False(open[0].GetProperty("readonly").GetBoolean()); Assert.Equal("Why", open[0].GetProperty("help").GetString());
        var locked = Defs(Render(fields, new Order { Qty = 1, Active = true }));
        Assert.True(locked[0].GetProperty("disabled").GetBoolean()); Assert.True(locked[0].GetProperty("readonly").GetBoolean()); Assert.Equal("Locked", locked[0].GetProperty("help").GetString());
        Assert.True(locked[1].GetProperty("disabled").GetBoolean()); Assert.False(locked[1].GetProperty("readonly").GetBoolean(), "a select has no read-only state: it is disabled");
        Assert.True(locked[2].GetProperty("disabled").GetBoolean());
    }

    [Fact]
    public void Placeholder_Rows_Span_HideLabel_Free_and_OptionsSource_reach_the_element()
    {
        PkFieldSpec<Order>[] fields =
        [
            new() { Key = "n", Label = "N", Placeholder = "Type", Span = true, HideLabel = true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "t", Label = "T", Kind = PkFieldKind.Textarea, Rows = 5, MaxLength = "40", Pattern = "x", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "s", Label = "S", Kind = PkFieldKind.Combobox, Free = true, Options = [new("old", "Old")], OptionsSource = () => [new("new", "New")], Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        ];
        var d = Defs(Render(fields));
        Assert.Equal("Type", d[0].GetProperty("placeholder").GetString()); Assert.True(d[0].GetProperty("span").GetBoolean()); Assert.True(d[0].GetProperty("hideLabel").GetBoolean());
        Assert.Equal("textarea", d[1].GetProperty("kind").GetString()); Assert.Equal(5, d[1].GetProperty("rows").GetInt32());
        Assert.Equal("40", d[1].GetProperty("maxLength").GetString()); Assert.Equal("x", d[1].GetProperty("pattern").GetString());
        Assert.Equal("combobox", d[2].GetProperty("kind").GetString()); Assert.True(d[2].GetProperty("free").GetBoolean());
        Assert.Equal(["new"], d[2].GetProperty("options").EnumerateArray().Select(o => o.GetProperty("value").GetString()!).ToArray());
    }

    [Fact]
    public async Task Bool_wraps_a_bool_property_as_a_checkbox()
    {
        var order = new Order();
        var cut = Render([PkFieldSpec<Order>.Bool("active", "Active", o => o.Active, (o, v) => o.Active = v) with { Hint = "On or off" }], order);
        Assert.Equal("checkbox", Defs(cut)[0].GetProperty("kind").GetString()); Assert.Equal("On or off", Defs(cut)[0].GetProperty("hint").GetString());
        await cut.Find("pk-field-group").TriggerEventAsync("onpk-field-change", new PkFieldChangeEventArgs { Key = "active", Value = JsonSerializer.SerializeToElement(true) });
        Assert.True(order.Active);
    }

    // Issue 270: a per-field LabelAction goes in the element's label-action slot for that field, re-evaluated with the record on every render.
    [Fact]
    public void LabelAction_is_slotted_for_its_field_key()
    {
        PkFieldSpec<Order>[] fields =
        [
            new() { Key = "a", Label = "A", LabelAction = o => b => { b.OpenElement(0, "button"); b.AddContent(1, "From " + o.Name); b.CloseElement(); }, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "c", Label = "C", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        ];
        var cut = Render(fields, new Order { Name = "X" });
        var slotted = cut.FindAll("pk-field-group > [slot]");
        Assert.Single(slotted);
        Assert.Equal("label-action-a", slotted[0].GetAttribute("slot"));
        Assert.Equal("From X", slotted[0].TextContent);
    }

    // Issue 753 gap 2: PkFieldKind.Combobox, its options from Options or from an async Search callback the element runs as the user types.
    private sealed class Pick { public string Sku { get; set; } = ""; }

    [Fact]
    public async Task A_Search_callback_is_handed_to_the_element_and_answers_with_the_options()
    {
        var queries = new List<string>();
        var cut = Render<PkFieldGroup<Pick>>(p => p.Add(x => x.Model, new Pick()).Add(x => x.Fields, [
            new PkFieldSpec<Pick> { Key = "sku", Label = "SKU", Kind = PkFieldKind.Combobox, Options = [new("seed", "Seed")],
                Search = q => { queries.Add(q); return Task.FromResult<IReadOnlyList<PkFieldOption>>([new("a1", "Alpha " + q)]); },
                Get = o => o.Sku, Set = (o, v) => o.Sku = v ?? "" }]));

        cut.WaitForAssertion(() => Assert.Contains(_bridge.Invocations, i => i.Identifier == "setCallback"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("search", call.Arguments[1]); Assert.Equal(true, call.Arguments[3]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkFieldSearch>>>(call.Arguments[2]).Value;
        var answer = JsonSerializer.SerializeToElement(await cut.InvokeAsync(() => host.Invoke(new PkFieldSearch { Key = "sku", Query = "ab" })), new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.Equal(["ab"], queries);
        Assert.Equal("a1", answer[0].GetProperty("value").GetString()); Assert.Equal("Alpha ab", answer[0].GetProperty("label").GetString());
    }

    [Fact]
    public void Without_a_Search_spec_no_callback_is_set()
    {
        Render(Fields());
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }
}
