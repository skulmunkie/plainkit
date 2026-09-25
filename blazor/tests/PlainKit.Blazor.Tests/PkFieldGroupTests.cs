using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 222: a plain field bound to a model property, from a list of PkFieldSpec<TItem>. No element of its own (like PkDataList).
public sealed class PkFieldGroupTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkFieldGroupTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private sealed class Order
    {
        public string Name { get; set; } = "";
        public int Qty { get; set; }
        public bool Active { get; set; }
        public string Status { get; set; } = "";
    }

    private static IReadOnlyList<PkFieldSpec<Order>> Fields() =>
    [
        new() { Key = "name", Label = "Name", Hint = "Full name", Required = true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        new() { Key = "qty", Label = "Quantity", Kind = PkFieldKind.Number, Min = "1", Max = "99", Step = "1", Get = o => o.Qty.ToString(), Set = (o, v) => o.Qty = int.Parse(v ?? "0") },
        new() { Key = "active", Label = "Active", Kind = PkFieldKind.Checkbox, Get = o => o.Active ? "true" : "", Set = (o, v) => o.Active = v == "true" },
        new() { Key = "status", Label = "Status", Kind = PkFieldKind.Select, Options = [new("open", "Open"), new("closed", "Closed")], Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" },
    ];

    [Fact]
    public void A_plain_field_renders_a_PkField_wrapping_a_pk_input_with_its_label_hint_required_and_initial_value()
    {
        var order = new Order { Name = "Acme" };
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, Fields()).Add(x => x.Model, order));

        var field = cut.Find("pk-field");
        Assert.Equal("Name", field.GetAttribute("label"));
        Assert.Equal("Full name", field.GetAttribute("help"));
        Assert.NotNull(field.GetAttribute("required"));
        var input = field.QuerySelector("pk-input");
        Assert.NotNull(input);
        Assert.Equal("text", input!.GetAttribute("type"));
        Assert.Equal("Acme", input.GetAttribute("value"));
    }

    [Fact]
    public void Kind_picks_the_control_and_the_input_type()
    {
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, Fields()).Add(x => x.Model, new Order()));

        var controls = cut.FindAll("pk-field").Select(f => f.Children.First()).ToList();
        Assert.Equal("pk-input", controls[0].TagName.ToLowerInvariant());
        Assert.Equal("number", controls[1].GetAttribute("type"));
        Assert.Equal("1", controls[1].GetAttribute("min")); Assert.Equal("99", controls[1].GetAttribute("max")); Assert.Equal("1", controls[1].GetAttribute("step"));
        Assert.Equal("pk-checkbox", controls[2].TagName.ToLowerInvariant());
        Assert.Equal("pk-select", controls[3].TagName.ToLowerInvariant());
        var options = controls[3].QuerySelectorAll("option");
        Assert.Equal(2, options.Length);
        Assert.Equal("open", options[0].GetAttribute("value")); Assert.Equal("Open", options[0].TextContent);
    }

    [Fact]
    public void Checkbox_checked_reflects_a_non_empty_non_false_value_from_Get()
    {
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, Fields()).Add(x => x.Model, new Order { Active = true }));
        var checkbox = cut.Find("pk-checkbox");
        Assert.NotNull(checkbox.GetAttribute("checked"));
    }

    [Fact]
    public async Task A_committed_value_calls_Set_on_the_model_and_raises_ModelChanged()
    {
        var order = new Order();
        var changed = 0;
        var cut = Render<PkFieldGroup<Order>>(p => p
            .Add(x => x.Fields, Fields())
            .Add(x => x.Model, order)
            .Add(x => x.ModelChanged, EventCallback.Factory.Create(this, () => changed++)));

        await cut.Find("pk-input").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "Ada" });

        Assert.Equal("Ada", order.Name);
        Assert.Equal(1, changed);
    }

    [Fact]
    public async Task A_committed_checkbox_change_calls_Set_with_true_or_empty_string()
    {
        var order = new Order();
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, Fields()).Add(x => x.Model, order));

        await cut.Find("pk-checkbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Checked = true });
        Assert.True(order.Active);

        await cut.Find("pk-checkbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Checked = false });
        Assert.False(order.Active);
    }

    // Issue 226: a field spec's When gates whether it renders at all, re-evaluated on every render (so a field that gates another
    // field just works), and a hidden Required field has no markup left for PkForm to validate.
    private static IReadOnlyList<PkFieldSpec<Order>> FieldsWithConditionalNote() =>
    [
        new() { Key = "status", Label = "Status", Kind = PkFieldKind.Select, Options = [new("open", "Open"), new("closed", "Closed")], Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" },
        new() { Key = "name", Label = "Closing note", Required = true, When = o => o.Status == "closed", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
    ];

    [Fact]
    public void A_field_whose_When_is_false_for_the_current_model_is_not_rendered()
    {
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, FieldsWithConditionalNote()).Add(x => x.Model, new Order { Status = "open" }));

        Assert.Single(cut.FindAll("pk-field"));
        Assert.Null(cut.Find("pk-field").GetAttribute("required"));
    }

    [Fact]
    public async Task Committing_a_value_that_flips_another_fields_When_shows_or_hides_it_on_the_next_render()
    {
        var order = new Order { Status = "open" };
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, FieldsWithConditionalNote()).Add(x => x.Model, order));
        Assert.Single(cut.FindAll("pk-field"));

        await cut.Find("pk-select").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "closed" });

        var fields = cut.FindAll("pk-field");
        Assert.Equal(2, fields.Count);
        Assert.NotNull(fields[1].GetAttribute("required"));
    }

    [Fact]
    public void A_hidden_Required_field_renders_no_markup_so_PkForm_has_nothing_to_validate_for_it()
    {
        // PkForm's own validity check is native HTML5 constraint validation in the browser, not something bUnit's virtual DOM runs;
        // what this component controls -- and what issue 226 asks for -- is that a hidden field's `required` control is not emitted
        // at all, so there is nothing left in the form for a real browser to check.
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, FieldsWithConditionalNote()).Add(x => x.Model, new Order { Status = "open" }));

        var fields = cut.FindAll("pk-field");
        Assert.Single(fields);
        Assert.DoesNotContain(fields, f => f.GetAttribute("label") == "Closing note");
    }

    // Issue 258: Placeholder, Rows, Help, Key as Name, and a typed bool factory.
    [Fact]
    public void Key_is_emitted_as_the_control_name_on_every_kind()
    {
        var fields = new List<PkFieldSpec<Order>>(Fields()) { new() { Key = "notes", Label = "Notes", Kind = PkFieldKind.Textarea, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" } };
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, fields).Add(x => x.Model, new Order()));

        Assert.Equal("name", cut.Find("pk-input[type=text]").GetAttribute("name"));
        Assert.Equal("active", cut.Find("pk-checkbox").GetAttribute("name"));
        Assert.Equal("status", cut.Find("pk-select").GetAttribute("name"));
        Assert.Equal("notes", cut.Find("pk-textarea").GetAttribute("name"));
    }

    [Fact]
    public void Placeholder_and_Rows_reach_the_input_and_the_textarea()
    {
        PkFieldSpec<Order>[] fields =
        [
            new() { Key = "a", Label = "A", Placeholder = "Your name", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "b", Label = "B", Kind = PkFieldKind.Textarea, Placeholder = "Notes", Rows = 6, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        ];
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, fields).Add(x => x.Model, new Order()));

        Assert.Equal("Your name", cut.Find("pk-input").GetAttribute("placeholder"));
        var ta = cut.Find("pk-textarea");
        Assert.Equal("Notes", ta.GetAttribute("placeholder"));
        Assert.Equal("6", ta.GetAttribute("rows"));
    }

    [Fact]
    public void Help_renders_a_help_tooltip_beside_the_label_text_and_is_absent_when_unset()
    {
        PkFieldSpec<Order>[] fields =
        [
            new() { Key = "a", Label = "A", Help = "Why we ask", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "b", Label = "B", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        ];
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, fields).Add(x => x.Model, new Order()));

        var tip = cut.Find("pk-field [slot=label-action] pk-tooltip");
        Assert.NotNull(tip.GetAttribute("help"));
        Assert.Equal("Why we ask", tip.GetAttribute("text"));
        // Issue 268: the tooltip must not take over the label slot, which would replace the label text.
        Assert.Equal("A", cut.Find("pk-field").GetAttribute("label"));
        Assert.Empty(cut.FindAll("pk-field [slot=label]"));
        Assert.Single(cut.FindAll("pk-tooltip"));
    }

    [Fact]
    public async Task Bool_wraps_a_bool_property_as_a_checkbox()
    {
        var order = new Order();
        PkFieldSpec<Order>[] fields = [PkFieldSpec<Order>.Bool("active", "Active", o => o.Active, (o, v) => o.Active = v) with { Hint = "On or off" }];
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, fields).Add(x => x.Model, order));

        Assert.Null(cut.Find("pk-checkbox").GetAttribute("checked"));
        Assert.Equal("On or off", cut.Find("pk-field").GetAttribute("help"));
        await cut.Find("pk-checkbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Checked = true });
        Assert.True(order.Active);
        await cut.Find("pk-checkbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Checked = false });
        Assert.False(order.Active);
    }

    // Issue 264: per-render Disabled/ReadOnly, Span, OptionsSource, HideLabel, HelpWhen and the help button's accessible name.
    [Fact]
    public void Disabled_and_ReadOnly_are_evaluated_against_the_model_on_every_render()
    {
        var order = new Order();
        var spec = new PkFieldSpec<Order> { Key = "name", Label = "Name", Disabled = o => o.Qty > 0, ReadOnly = o => o.Status == "locked", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" };
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, [spec]).Add(x => x.Model, order));
        Assert.Null(cut.Find("pk-input").GetAttribute("disabled"));
        Assert.Null(cut.Find("pk-input").GetAttribute("readonly"));

        order.Qty = 1; order.Status = "locked";
        cut.Render(p => p.Add(x => x.Fields, [spec]).Add(x => x.Model, order));
        Assert.NotNull(cut.Find("pk-input").GetAttribute("disabled"));
        Assert.NotNull(cut.Find("pk-input").GetAttribute("readonly"));
    }

    [Fact]
    public void ReadOnly_disables_a_select_and_a_checkbox_which_have_no_read_only_state()
    {
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, [
            new PkFieldSpec<Order> { Key = "s", Label = "S", Kind = PkFieldKind.Select, ReadOnly = _ => true, Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" },
            PkFieldSpec<Order>.Bool("a", "A", o => o.Active, (o, v) => o.Active = v) with { ReadOnly = _ => true }]).Add(x => x.Model, new Order()));
        Assert.NotNull(cut.Find("pk-select").GetAttribute("disabled"));
        Assert.NotNull(cut.Find("pk-checkbox").GetAttribute("disabled"));
    }

    [Fact]
    public void Span_puts_form_span_on_the_field_wrapper_and_Name_is_a_typed_attribute_on_select_and_checkbox()
    {
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, [
            new PkFieldSpec<Order> { Key = "name", Label = "Name", Span = true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new PkFieldSpec<Order> { Key = "s", Label = "S", Kind = PkFieldKind.Select, Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" },
            PkFieldSpec<Order>.Bool("a", "A", o => o.Active, (o, v) => o.Active = v)]).Add(x => x.Model, new Order()));
        var fields = cut.FindAll("pk-field");
        Assert.Contains("form-span", fields[0].ClassList);
        Assert.DoesNotContain("form-span", fields[1].ClassList);
        Assert.Equal("s", cut.Find("pk-select").GetAttribute("name"));
        Assert.Equal("a", cut.Find("pk-checkbox").GetAttribute("name"));
    }

    [Fact]
    public void OptionsSource_is_read_at_every_render_and_wins_over_Options()
    {
        var loaded = new List<PkFieldOption>();
        var spec = new PkFieldSpec<Order> { Key = "s", Label = "S", Kind = PkFieldKind.Select, Options = [new("x", "X")], OptionsSource = () => loaded, Get = o => o.Status, Set = (o, v) => o.Status = v ?? "" };
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, [spec]).Add(x => x.Model, new Order()));
        Assert.Empty(cut.FindAll("option"));
        loaded.Add(new("a", "A"));
        cut.Render(p => p.Add(x => x.Fields, [spec]).Add(x => x.Model, new Order()));
        Assert.Equal("a", cut.Find("option").GetAttribute("value"));
    }

    [Fact]
    public void HideLabel_drops_the_visible_label_and_keeps_it_as_the_controls_accessible_name()
    {
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, [
            new PkFieldSpec<Order> { Key = "n", Label = "Notes", Kind = PkFieldKind.Textarea, HideLabel = true, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" }]).Add(x => x.Model, new Order()));
        Assert.Null(cut.Find("pk-field").GetAttribute("label"));
        Assert.Equal("Notes", cut.Find("pk-textarea").GetAttribute("label"));
    }

    [Fact]
    public void HelpWhen_overrides_Help_per_record_and_the_help_button_is_named_for_the_field()
    {
        var spec = new PkFieldSpec<Order> { Key = "n", Label = "Code", Help = "Editable", HelpWhen = o => o.Qty > 0 ? "Locked" : null, Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" };
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, [spec]).Add(x => x.Model, new Order()));
        Assert.Equal("Editable", cut.Find("pk-tooltip").GetAttribute("text"));
        Assert.Equal("Help for Code", cut.Find("pk-tooltip").GetAttribute("label"));
        cut.Render(p => p.Add(x => x.Fields, [spec]).Add(x => x.Model, new Order { Qty = 1 }));
        Assert.Equal("Locked", cut.Find("pk-tooltip").GetAttribute("text"));
    }

    // Issue 270: a per-field LabelAction beside the label, after the Help tooltip.
    [Fact]
    public void LabelAction_renders_in_the_label_action_slot_after_Help_and_keeps_the_label_text()
    {
        PkFieldSpec<Order>[] fields =
        [
            new() { Key = "a", Label = "A", Help = "Why", LabelAction = o => b => { b.OpenElement(0, "button"); b.AddAttribute(1, "class", "adopt"); b.AddContent(2, "From " + o.Name); b.CloseElement(); },
                    Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "b", Label = "B", LabelAction = o => b => b.AddContent(0, "flag"), Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
            new() { Key = "c", Label = "C", Get = o => o.Name, Set = (o, v) => o.Name = v ?? "" },
        ];
        var cut = Render<PkFieldGroup<Order>>(p => p.Add(x => x.Fields, fields).Add(x => x.Model, new Order { Name = "X" }));

        var first = cut.FindAll("pk-field")[0];
        var slot = first.QuerySelector("[slot=label-action]")!;
        Assert.Equal("pk-tooltip", slot.Children[0].LocalName);
        Assert.Equal("button", slot.Children[1].LocalName);
        Assert.Equal("From X", slot.Children[1].TextContent);
        Assert.Equal("A", first.GetAttribute("label"));
        Assert.Contains("flag", cut.FindAll("pk-field")[1].QuerySelector("[slot=label-action]")!.TextContent);
        Assert.Empty(cut.FindAll("pk-field")[2].QuerySelectorAll("[slot=label-action]"));
    }
}
