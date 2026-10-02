using Bunit;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Typed multi-value binding (issue #804): a mapping whose model block says "multi" gets Values / ValuesChanged / ValuesExpression next to the
// comma-joined Value. The element still speaks the escaped string (core owns the encoding: a comma in a value is written \, and a backslash \\);
// the wrapper only converts, so a value with a comma round-trips.
public sealed class MultiValueBindingTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public MultiValueBindingTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_select_Values_binding_follows_the_element_in_both_directions()
    {
        IReadOnlyList<string>? values = new[] { "S", "M" };
        var cut = Render<PkSelect>(p => p.Add(x => x.Multiple, true).Bind(x => x.Values, values, v => values = v));
        Assert.Equal("S,M", cut.Find("pk-select").GetAttribute("value"));

        await cut.Find("pk-select").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "M,L" });
        Assert.Equal(new[] { "M", "L" }, values);
    }

    [Fact]
    public async Task A_value_with_a_comma_or_backslash_round_trips()
    {
        IReadOnlyList<string>? values = new[] { "a,b", "c\\d", "plain" };
        var cut = Render<PkTagInput>(p => p.Bind(x => x.Values, values, v => values = v));
        Assert.Equal("a\\,b,c\\d,plain", cut.Find("pk-tag-input").GetAttribute("value"));

        await cut.Find("pk-tag-input").TriggerEventAsync("onpk-tags-change", new PkTagsChangeEventArgs { Value = "x\\,y,z" });
        Assert.Equal(new[] { "x,y", "z" }, values);
    }

    [Fact]
    public async Task An_empty_value_is_an_empty_list()
    {
        IReadOnlyList<string>? values = new[] { "a" };
        var cut = Render<PkTagInput>(p => p.Bind(x => x.Values, values, v => values = v));
        await cut.Find("pk-tag-input").TriggerEventAsync("onpk-tags-change", new PkTagsChangeEventArgs { Value = "" });
        Assert.Empty(values!);
    }

    [Fact]
    public async Task The_string_Value_binding_is_unchanged()
    {
        var value = "a,b";
        var cut = Render<PkTagInput>(p => p.Bind(x => x.Value, value, v => value = v ?? ""));
        Assert.Equal("a,b", cut.Find("pk-tag-input").GetAttribute("value"));
        await cut.Find("pk-tag-input").TriggerEventAsync("onpk-tags-change", new PkTagsChangeEventArgs { Value = "a,b,c" });
        Assert.Equal("a,b,c", value);
        Assert.Null(cut.Instance.Values);
    }

    [Fact]
    public async Task ValuesExpression_marks_the_field_modified_and_shows_validation_messages()
    {
        var cut = Render<FormControlsHost>();
        var host = cut.Instance;
        Assert.False(host.Context.IsModified());

        await cut.InvokeAsync(() => host.Context.Validate());
        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("pk-tag-input").GetAttribute("invalid")));
        Assert.Contains("Add a tag", cut.Markup);

        await cut.Find("pk-tag-input").TriggerEventAsync("onpk-tags-change", new PkTagsChangeEventArgs { Value = "a\\,b" });
        Assert.Equal(new[] { "a,b" }, host.Model.Tags);
        Assert.True(host.Context.IsModified(new FieldIdentifier(host.Model, "Tags")));
        cut.WaitForAssertion(() => Assert.Null(cut.Find("pk-tag-input").GetAttribute("invalid")));

        await cut.Find("pk-select#sizes").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "S,M" });
        Assert.Equal(new[] { "S", "M" }, host.Model.Sizes);
        Assert.True(host.Context.IsModified(new FieldIdentifier(host.Model, "Sizes")));
        Assert.False(host.Context.IsModified(new FieldIdentifier(host.Model, "Size")));
    }
}
