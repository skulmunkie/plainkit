using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// A representative sample of the generated wrappers (Generated/): a plain prop, an enum, a two-way bound input, a slot, an event.
// scripts/tests/generate-blazor.test.mjs covers the generator itself; these check what it writes renders and behaves.
public sealed class GeneratedComponentTests : TestContext
{
    public GeneratedComponentTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void A_plain_prop_becomes_an_attribute_and_an_unset_one_is_left_off()
    {
        var cut = RenderComponent<PkAvatar>(p => p.Add(x => x.Name, "Ada Lovelace"));
        var el = cut.Find("pk-avatar");

        Assert.Equal("Ada Lovelace", el.GetAttribute("name"));
        Assert.Null(el.GetAttribute("src"));
    }

    [Fact]
    public void A_boolean_is_present_when_true_and_absent_when_false()
    {
        var on = RenderComponent<PkButton>(p => p.Add(x => x.Disabled, true));
        var off = RenderComponent<PkButton>();

        Assert.NotNull(on.Find("pk-button").GetAttribute("disabled"));
        Assert.Null(off.Find("pk-button").GetAttribute("disabled"));
    }

    [Fact]
    public void An_enum_is_sent_as_its_attribute_value_and_left_off_when_null()
    {
        var set = RenderComponent<PkButton>(p => p.Add(x => x.Variant, ButtonVariant.Secondary));
        var unset = RenderComponent<PkButton>();

        Assert.Equal("secondary", set.Find("pk-button").GetAttribute("variant"));
        Assert.Null(unset.Find("pk-button").GetAttribute("variant"));
    }

    [Fact]
    public async Task A_link_button_sends_href_target_rel_and_download_and_still_raises_click()
    {
        MouseEventArgs? got = null;
        var cut = RenderComponent<PkButton>(p => p
            .Add(x => x.Href, "/reports").Add(x => x.Target, "_blank").Add(x => x.Rel, "noopener").Add(x => x.Download, "r.csv")
            .Add(x => x.OnClick, EventCallback.Factory.Create<MouseEventArgs>(this, e => got = e)));
        var el = cut.Find("pk-button");

        Assert.Equal("/reports", el.GetAttribute("href"));
        Assert.Equal("_blank", el.GetAttribute("target"));
        Assert.Equal("noopener", el.GetAttribute("rel"));
        Assert.Equal("r.csv", el.GetAttribute("download"));
        await el.ClickAsync(new MouseEventArgs { Button = 0, Detail = 1 });
        Assert.NotNull(got);
        Assert.Null(RenderComponent<PkButton>().Find("pk-button").GetAttribute("href"));
    }

    [Fact]
    public void An_enum_with_a_default_always_sends_it()
    {
        var cut = RenderComponent<PkAlert>();
        Assert.Equal("danger", cut.Find("pk-alert").GetAttribute("kind"));

        cut.SetParametersAndRender(p => p.Add(x => x.Kind, PkAlertKind.Warning));
        Assert.Equal("warning", cut.Find("pk-alert").GetAttribute("kind"));
    }

    [Fact]
    public void A_number_is_sent_in_invariant_culture_and_a_plain_int_starts_at_the_element_default()
    {
        var cut = RenderComponent<PkPagination>(p => p.Add(x => x.Total, 120));
        var el = cut.Find("pk-pagination");

        Assert.Equal("120", el.GetAttribute("total"));
        Assert.Equal("1", el.GetAttribute("page"));
        Assert.Equal("25", el.GetAttribute("page-size"));
    }

    [Fact]
    public async Task A_bound_input_follows_the_value_change_event_and_reports_it()
    {
        string? bound = "before";
        var cut = RenderComponent<PkInput>(p => p
            .Add(x => x.Value, bound)
            .Add(x => x.ValueChanged, EventCallback.Factory.Create<string?>(this, v => bound = v)));
        Assert.Equal("before", cut.Find("pk-input").GetAttribute("value"));

        await cut.Find("pk-input").TriggerEventAsync("onpk-value-change", new PkValueChangeEventArgs { Value = "after" });

        Assert.Equal("after", bound);
    }

    [Fact]
    public async Task A_checkbox_binds_its_checked_state_through_the_change_event()
    {
        var value = false;
        var cut = RenderComponent<PkCheckbox>(p => p
            .Add(x => x.Checked, value)
            .Add(x => x.CheckedChanged, EventCallback.Factory.Create<bool>(this, v => value = v)));

        await cut.Find("pk-checkbox").TriggerEventAsync("onpk-change", new PkChangeEventArgs { Checked = true });

        Assert.True(value);
    }

    [Fact]
    public async Task A_dialog_closes_itself_from_pk_close_and_still_raises_OnClose()
    {
        var open = true; PkCloseEventArgs? closed = null;
        var cut = RenderComponent<PkDialog>(p => p
            .Add(x => x.IsOpen, open)
            .Add(x => x.IsOpenChanged, EventCallback.Factory.Create<bool>(this, v => open = v))
            .Add(x => x.OnClose, EventCallback.Factory.Create<PkCloseEventArgs>(this, e => closed = e)));
        Assert.NotNull(cut.Find("pk-dialog").GetAttribute("open"));

        await cut.Find("pk-dialog").TriggerEventAsync("onpk-close", new PkCloseEventArgs { Reason = "escape" });

        Assert.False(open);
        Assert.Equal("escape", closed?.Reason);
    }

    [Fact]
    public void A_default_slot_is_the_content_and_a_named_slot_is_a_slotted_child()
    {
        var cut = RenderComponent<PkInput>(p => p.Add(x => x.PrefixContent, b => b.AddMarkupContent(0, "<b>$</b>")));
        var slotted = cut.Find("pk-input > span[slot=prefix]");

        Assert.Equal("<b>$</b>", slotted.InnerHtml);
        Assert.Empty(cut.FindAll("span[slot=suffix]"));

        var alert = RenderComponent<PkAlert>(p => p.Add(x => x.Message, "Saved."));
        Assert.Equal("Saved.", alert.Find("pk-alert").TextContent);
    }

    [Fact]
    public async Task An_event_with_no_detail_raises_a_plain_callback()
    {
        var dismissed = 0;
        var cut = RenderComponent<PkAlert>(p => p.Add(x => x.OnDismiss, EventCallback.Factory.Create(this, () => dismissed++)));

        await cut.Find("pk-alert").TriggerEventAsync("onpk-dismiss", new EventArgs());

        Assert.Equal(1, dismissed);
    }

    [Fact]
    public async Task An_event_with_a_detail_passes_it_typed()
    {
        PkSearchEventArgs? got = null;
        var cut = RenderComponent<PkInput>(p => p.Add(x => x.OnSearch, EventCallback.Factory.Create<PkSearchEventArgs>(this, e => got = e)));

        await cut.Find("pk-input").TriggerEventAsync("onpk-search", new PkSearchEventArgs { Value = "plainkit" });

        Assert.Equal("plainkit", got?.Value);
    }

    [Fact]
    public async Task A_native_click_passes_the_mouse_event()
    {
        MouseEventArgs? got = null;
        var cut = RenderComponent<PkButton>(p => p.Add(x => x.OnClick, EventCallback.Factory.Create<MouseEventArgs>(this, e => got = e)));

        await cut.Find("pk-button").ClickAsync(new MouseEventArgs { Button = 0, Detail = 1 });

        Assert.NotNull(got);
    }

    [Fact]
    public async Task A_date_is_sent_as_an_iso_string_and_read_back_from_the_select_event()
    {
        DateOnly? picked = null;
        var cut = RenderComponent<PkCalendar>(p => p
            .Add(x => x.Value, new DateOnly(2026, 9, 19))
            .Add(x => x.ValueChanged, EventCallback.Factory.Create<DateOnly?>(this, d => picked = d)));
        Assert.Equal("2026-09-19", cut.Find("pk-calendar").GetAttribute("value"));

        await cut.Find("pk-calendar").TriggerEventAsync("onpk-select", new PkSelectEventArgs { Value = "2026-10-02" });

        Assert.Equal(new DateOnly(2026, 10, 2), picked);
    }

    [Fact]
    public void Extra_class_and_unmatched_attributes_land_on_the_element()
    {
        var cut = RenderComponent<PkAlert>(p => p
            .Add(x => x.ExtraClass, "mt-2")
            .AddUnmatched("data-test", "alert-1"));
        var el = cut.Find("pk-alert");

        Assert.Equal("mt-2", el.GetAttribute("class"));
        Assert.Equal("alert-1", el.GetAttribute("data-test"));
    }

    [Fact]
    public void A_generated_component_loads_the_toolkit_once_it_is_on_the_page()
    {
        RenderComponent<PkBadge>();

        Assert.Contains(JSInterop.Invocations, i => i.Identifier == "import");
    }
}
