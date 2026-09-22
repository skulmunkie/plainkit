using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Unmatched attributes (issue #44): every component puts the attributes it has no parameter for on its element, and merges `class`.
public sealed class AttributePassthroughTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public AttributePassthroughTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void Id_data_and_aria_attributes_reach_the_element_instead_of_throwing()
    {
        var cut = Render<PkButton>(p => p.AddUnmatched("id", "x").AddUnmatched("data-test", "y").AddUnmatched("aria-describedby", "z"));
        var el = cut.Find("pk-button");

        Assert.Equal("x", el.Id);
        Assert.Equal("y", el.GetAttribute("data-test"));
        Assert.Equal("z", el.GetAttribute("aria-describedby"));
    }

    [Fact]
    public void A_class_is_kept_on_a_component_without_ExtraClass()
    {
        var cut = Render<PkBadge>(p => p.AddUnmatched("class", "mine"));
        Assert.Equal("mine", cut.Find("pk-badge").GetAttribute("class"));
    }

    [Fact]
    public void A_class_is_merged_with_ExtraClass_and_ExtraClass_alone_still_works()
    {
        var both = Render<PkAlert>(p => p.Add(x => x.ExtraClass, "extra").AddUnmatched("class", "mine"));
        var only = Render<PkAlert>(p => p.Add(x => x.ExtraClass, "extra"));
        var none = Render<PkAlert>();

        Assert.Equal("extra mine", both.Find("pk-alert").GetAttribute("class"));
        Assert.Equal("extra", only.Find("pk-alert").GetAttribute("class"));
        Assert.Null(none.Find("pk-alert").GetAttribute("class"));
    }

    [Fact]
    public async Task Unmatched_attributes_and_event_handlers_work_together()
    {
        var dismissed = 0;
        var cut = Render<PkAlert>(p => p
            .Add(x => x.OnDismiss, EventCallback.Factory.Create(this, () => dismissed++))
            .AddUnmatched("data-test", "alert"));
        var el = cut.Find("pk-alert");

        Assert.Equal("alert", el.GetAttribute("data-test"));
        await el.TriggerEventAsync("onpk-dismiss", EventArgs.Empty);
        Assert.Equal(1, dismissed);
    }

    [Fact]
    public void A_changed_attribute_follows_a_parameter_change()
    {
        var cut = Render<PkButton>(p => p.AddUnmatched("data-test", "one"));
        cut.Render(p => p.AddUnmatched("data-test", "two"));
        Assert.Equal("two", cut.Find("pk-button").GetAttribute("data-test"));
    }

    [Fact]
    public void The_event_handlers_are_built_once_and_reused_on_every_parameter_change()
    {
        var cut = Render<PkAlert>();
        var first = HandlerDictionary(cut.Instance);

        cut.Render(p => p.Add(x => x.Dismissible, true));
        cut.Render(p => p.Add(x => x.Title, "Heading"));

        Assert.Same(first, HandlerDictionary(cut.Instance));
        Assert.True(((Dictionary<string, object>)first).ContainsKey("onpk-dismiss"));
    }

    [Fact]
    public void The_new_alert_and_dialog_parameters_are_plain_attributes()
    {
        var alert = Render<PkAlert>(p => p.Add(x => x.Boxed, false).Add(x => x.Inline, true).Add(x => x.Compact, true));
        var el = alert.Find("pk-alert");
        Assert.NotNull(el.GetAttribute("plain"));
        Assert.NotNull(el.GetAttribute("inline"));
        Assert.NotNull(el.GetAttribute("compact"));
        Assert.Null(Render<PkAlert>().Find("pk-alert").GetAttribute("plain"));

        var hidden = Render<PkDialog>(p => p.Add(x => x.ShowCloseButton, false));
        Assert.NotNull(hidden.Find("pk-dialog").GetAttribute("hide-close"));
        Assert.Null(Render<PkDialog>().Find("pk-dialog").GetAttribute("hide-close"));

        var tip = Render<PkTooltip>(p => p.Add(x => x.Title, "Heading"));
        Assert.Equal("Heading", tip.Find("pk-tooltip").GetAttribute("heading"));
    }

    private static object HandlerDictionary(PkElementBase component) =>
        typeof(PkElementBase).GetField("_handlers", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.GetValue(component)!;
}
