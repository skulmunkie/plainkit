using Bunit;
using Microsoft.AspNetCore.Components;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 261: the page template of a create-or-edit record page (toolbar, tabs, error, main column and sidebar).
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

    private static string[] Toolbar(IRenderedComponent<PkRecordForm> cut) =>
        cut.FindAll("pk-cluster pk-button").Select(b => b.TextContent.Trim()).ToArray();

    [Fact]
    public void A_bare_form_has_only_a_Save_button()
    {
        var cut = Render<PkRecordForm>(p => p.Add(x => x.ChildContent, Text("fields")));

        Assert.Equal(["Save"], Toolbar(cut));
        var save = cut.Find("pk-cluster pk-button");
        Assert.Equal("submit", save.GetAttribute("type"));
        Assert.Equal("primary", save.GetAttribute("variant"));
        Assert.Equal("end", cut.Find("pk-cluster").GetAttribute("justify"));
        Assert.Contains("fields", cut.Find("pk-form form").TextContent);
    }

    [Fact]
    public void The_toolbar_is_Cancel_then_Actions_then_Delete_then_Save_and_the_labels_are_configurable()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.OnCancel, EventCallback.Factory.Create(this, () => { }))
            .Add(x => x.OnDelete, EventCallback.Factory.Create(this, () => { }))
            .Add(x => x.DeleteLabel, "Remove location")
            .Add(x => x.SaveLabel, "Save location")
            .Add(x => x.Actions, b => { b.OpenComponent<PkButton>(0); b.AddAttribute(1, nameof(PkButton.ChildContent), Text("Duplicate")); b.CloseComponent(); }));

        Assert.Equal(["Cancel", "Duplicate", "Remove location", "Save location"], Toolbar(cut));
        var buttons = cut.FindAll("pk-cluster pk-button");
        Assert.Equal("ghost", buttons[0].GetAttribute("variant"));
        Assert.Equal("warn", buttons[2].GetAttribute("variant"));
    }

    [Fact]
    public async Task Cancel_and_Delete_raise_their_callbacks_and_the_valid_event_raises_OnValid()
    {
        int cancelled = 0, deleted = 0, valid = 0;
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.OnCancel, EventCallback.Factory.Create(this, () => cancelled++))
            .Add(x => x.OnDelete, EventCallback.Factory.Create(this, () => deleted++))
            .Add(x => x.OnValid, EventCallback.Factory.Create(this, () => valid++)));

        var buttons = cut.FindAll("pk-cluster pk-button");
        await buttons[0].ClickAsync(new());
        await buttons[1].ClickAsync(new());
        await cut.Find("pk-form").TriggerEventAsync("onpk-valid", EventArgs.Empty);

        Assert.Equal((1, 1, 1), (cancelled, deleted, valid));
    }

    [Fact]
    public void SaveDisabled_disables_Save_only()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.OnDelete, EventCallback.Factory.Create(this, () => { }))
            .Add(x => x.SaveDisabled, true));

        var buttons = cut.FindAll("pk-cluster pk-button");
        Assert.Null(buttons[0].GetAttribute("disabled"));
        Assert.NotNull(buttons[1].GetAttribute("disabled"));
    }

    [Fact]
    public void Busy_shows_the_busy_text_on_Save_and_disables_Delete()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.OnDelete, EventCallback.Factory.Create(this, () => { }))
            .Add(x => x.Busy, true));

        var buttons = cut.FindAll("pk-cluster pk-button");
        Assert.NotNull(buttons[0].GetAttribute("disabled"));
        Assert.NotNull(buttons[1].GetAttribute("busy"));
        Assert.Equal("Saving…", buttons[1].GetAttribute("busy-text"));

        cut.Render(p => p.Add(x => x.BusyText, "Recording…"));
        Assert.Equal("Recording…", cut.FindAll("pk-cluster pk-button")[1].GetAttribute("busy-text"));
    }

    [Fact]
    public void Error_draws_an_error_alert_below_the_toolbar_and_nothing_when_empty()
    {
        var cut = Render<PkRecordForm>();
        Assert.Empty(cut.FindAll("pk-alert"));

        cut.Render(p => p.Add(x => x.Error, "Only one location can be primary."));

        var alert = cut.Find("pk-alert");
        Assert.Equal("danger", alert.GetAttribute("kind"));
        Assert.Equal("Only one location can be primary.", alert.TextContent.Trim());
    }

    [Fact]
    public void Tabs_sit_between_the_toolbar_and_the_alert()
    {
        var cut = Render<PkRecordForm>(p => p
            .Add(x => x.Tabs, Text("TABS"))
            .Add(x => x.Error, "ERR"));

        var html = cut.Find("pk-form form").InnerHtml;
        Assert.True(html.IndexOf("pk-cluster", StringComparison.Ordinal) < html.IndexOf("TABS", StringComparison.Ordinal));
        Assert.True(html.IndexOf("TABS", StringComparison.Ordinal) < html.IndexOf("ERR", StringComparison.Ordinal));
    }

    [Fact]
    public void A_Sidebar_puts_the_body_in_a_detail_layout_and_no_Sidebar_leaves_it_out()
    {
        var without = Render<PkRecordForm>(p => p.Add(x => x.ChildContent, Text("main")));
        Assert.Empty(without.FindAll("pk-detail-layout"));

        var with = Render<PkRecordForm>(p => p
            .Add(x => x.ChildContent, Text("main"))
            .Add(x => x.Sidebar, Text("status")));

        var layout = with.Find("pk-detail-layout");
        Assert.Contains("main", layout.TextContent);
        Assert.Equal("status", layout.QuerySelector("[slot=sidebar]")!.TextContent);
    }
}
