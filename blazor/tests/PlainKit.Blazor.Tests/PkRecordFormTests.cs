using Bunit;
using Microsoft.AspNetCore.Components;
using PlainKit.Blazor;
using PlainKit.Blazor.Components;

namespace PlainKit.Blazor.Tests;

// Issue 999: PkRecordForm is the generated wrapper of pk-record-form; the toolbar, tabs, error and layout are drawn by the element.
public sealed class PkRecordFormTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkRecordFormTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static RenderFragment Text(string text) => b => b.AddContent(0, text);

    [Fact]
    public void A_bare_form_renders_the_element_with_no_Cancel_or_Delete()
    {
        var cut = Render<PkRecordForm>(p => p.Add(x => x.ChildContent, Text("fields")));

        var el = cut.Find("pk-record-form");
        Assert.Contains("fields", el.TextContent);
        Assert.Null(el.GetAttribute("cancellable"));
        Assert.Null(el.GetAttribute("deletable"));
    }

    [Fact]
    public void A_set_OnCancel_or_OnDelete_shows_its_button()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.OnCancel, EventCallback.Factory.Create(this, () => { }))
            .Add(x => x.OnDelete, EventCallback.Factory.Create(this, () => { })));

        var el = cut.Find("pk-record-form");
        Assert.NotNull(el.GetAttribute("cancellable"));
        Assert.NotNull(el.GetAttribute("deletable"));
    }

    [Fact]
    public async Task The_three_record_events_raise_their_callbacks()
    {
        int cancelled = 0, deleted = 0, valid = 0;
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.OnCancel, EventCallback.Factory.Create(this, () => cancelled++))
            .Add(x => x.OnDelete, EventCallback.Factory.Create(this, () => deleted++))
            .Add(x => x.OnValid, EventCallback.Factory.Create(this, () => valid++)));

        var el = cut.Find("pk-record-form");
        await el.TriggerEventAsync("onpk-record-cancel", EventArgs.Empty);
        await el.TriggerEventAsync("onpk-record-delete", EventArgs.Empty);
        await el.TriggerEventAsync("onpk-record-save", EventArgs.Empty);

        Assert.Equal((1, 1, 1), (cancelled, deleted, valid));
    }

    [Fact]
    public void The_parameters_become_the_elements_attributes()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.SaveLabel, "Save location")
            .Add(x => x.DeleteLabel, "Remove location")
            .Add(x => x.BusyText, "Recording…")
            .Add(x => x.SaveDisabled, true)
            .Add(x => x.Busy, true)
            .Add(x => x.ActionsInHeader, true)
            .Add(x => x.Error, "Only one location can be primary."));

        var el = cut.Find("pk-record-form");
        Assert.Equal("Save location", el.GetAttribute("save-label"));
        Assert.Equal("Remove location", el.GetAttribute("delete-label"));
        Assert.Equal("Recording…", el.GetAttribute("busy-text"));
        Assert.NotNull(el.GetAttribute("save-disabled"));
        Assert.NotNull(el.GetAttribute("busy"));
        Assert.NotNull(el.GetAttribute("actions-in-header"));
        Assert.Equal("Only one location can be primary.", el.GetAttribute("error"));
    }

    [Fact]
    public void Tabs_Actions_and_Sidebar_fill_their_slots()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.Tabs, Text("TABS"))
            .Add(x => x.Actions, Text("ACTIONS"))
            .Add(x => x.Sidebar, Text("status")));

        Assert.Equal("TABS", cut.Find("[slot=tabs]").TextContent);
        Assert.Equal("ACTIONS", cut.Find("[slot=actions]").TextContent);
        Assert.Equal("status", cut.Find("[slot=sidebar]").TextContent);
    }

    [Fact]
    public async Task SubmitAsync_calls_the_elements_submit_method()
    {
        var cut = Render<PkRecordForm>();

        await cut.Instance.SubmitAsync();

        var call = JSInterop.Invocations.Single(i => i.Identifier == "call");
        Assert.Equal("submit", call.Arguments[1]);
    }

    [Fact]
    public void A_detail_layout_renders_its_Section_and_NextLabel_as_attributes()
    {
        var layout = Render<PkDetailLayout>(p => p.Add(x => x.Section, "pricing").Add(x => x.NextLabel, "Weiter")).Find("pk-detail-layout");
        Assert.Equal("pricing", layout.GetAttribute("section"));
        Assert.Equal("Weiter", layout.GetAttribute("next-label"));
    }
}
