using Bunit;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// ValueExpression / EditContext support on the generated form controls (issue #753): a control bound inside an EditForm names its field, marks it
// modified when the user changes it, and shows the field's validation state. All of it comes from the generator, driven by the mapping's model block.
public sealed class FormControlBindingTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public FormControlBindingTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_changed_input_marks_its_field_modified_and_notifies_the_edit_context()
    {
        var cut = Render<FormControlsHost>();
        var host = cut.Instance;
        var changed = new List<string>();
        host.Context.OnFieldChanged += (_, e) => changed.Add(e.FieldIdentifier.FieldName);
        Assert.False(host.Context.IsModified());

        await cut.Find("pk-input").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "Ada" });

        Assert.Equal("Ada", host.Model.Name);
        Assert.True(host.Context.IsModified(new FieldIdentifier(host.Model, "Name")));
        Assert.Equal(new[] { "Name" }, changed);
    }

    [Fact]
    public async Task The_field_name_comes_from_the_ValueExpression_of_each_kind_of_control()
    {
        var cut = Render<FormControlsHost>();
        var host = cut.Instance;

        await cut.Find("pk-select").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "L" });
        await cut.Find("pk-checkbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Checked = true });
        await cut.Find("pk-combobox").TriggerEventAsync("onpk-combo-select", new PkComboSelectEventArgs { Value = "A-1" });

        Assert.True(host.Context.IsModified(new FieldIdentifier(host.Model, "Size")));
        Assert.True(host.Context.IsModified(new FieldIdentifier(host.Model, "Agree")));
        Assert.True(host.Context.IsModified(new FieldIdentifier(host.Model, "Sku")));
        Assert.False(host.Context.IsModified(new FieldIdentifier(host.Model, "Name")));
    }

    [Fact]
    public async Task A_field_with_validation_messages_is_invalid_until_it_validates()
    {
        var cut = Render<FormControlsHost>();
        var host = cut.Instance;
        Assert.Null(cut.Find("pk-input").GetAttribute("invalid"));

        await cut.InvokeAsync(() => host.Context.Validate());
        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("pk-input").GetAttribute("invalid")));
        Assert.Contains("Name is required", cut.Markup);
        Assert.Null(cut.Find("pk-select").GetAttribute("invalid"));

        await cut.Find("pk-input").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "Ada" });
        cut.WaitForAssertion(() => Assert.Null(cut.Find("pk-input").GetAttribute("invalid")));
        Assert.DoesNotContain("Name is required", cut.Markup);
    }

    [Fact]
    public async Task A_control_without_an_edit_context_or_expression_still_binds()
    {
        var value = "";
        var cut = Render<PkInput>(p => p.Bind(x => x.Value, value, v => value = v ?? ""));
        await cut.Find("pk-input").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "x" });
        Assert.Equal("x", value);
        Assert.Null(cut.Find("pk-input").GetAttribute("invalid"));
    }

    [Fact]
    public void The_explicit_IsInvalid_still_applies_without_a_field()
    {
        var cut = Render<PkInput>(p => p.Add(x => x.IsInvalid, true));
        Assert.NotNull(cut.Find("pk-input").GetAttribute("invalid"));
    }
}
