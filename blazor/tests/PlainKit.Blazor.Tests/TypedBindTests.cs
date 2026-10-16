using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// @bind-Size on PkTray and @bind-ActivePane on PkWorkspace with typed enums (issue #1444): the element reports the wire string, the parameter follows it as the enum.
public sealed class TypedBindTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public TypedBindTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_tray_bound_with_bind_size_follows_pk_size_change_as_the_enum()
    {
        var size = TraySize.Medium;
        var cut = Render<PkTray>(p => p.Bind(x => x.Size, size, v => size = v));
        Assert.Equal("medium", cut.Find("pk-tray").GetAttribute("size"));

        await cut.Find("pk-tray").TriggerEventAsync("onpk-size-change", new PkSizeChangeEventArgs { Size = "large" });
        Assert.Equal(TraySize.Large, size);
        Assert.Equal("large", cut.Find("pk-tray").GetAttribute("size"));
    }

    [Fact]
    public async Task A_workspace_bound_with_bind_active_pane_follows_pk_pane_change_as_the_enum()
    {
        var pane = WorkspacePane.Main;
        var cut = Render<PkWorkspace>(p => p.Bind(x => x.ActivePane, pane, v => pane = v));
        await cut.Find("pk-workspace").TriggerEventAsync("onpk-pane-change", new PkPaneChangeEventArgs { Pane = "aside" });
        Assert.Equal(WorkspacePane.Aside, pane);
        Assert.Equal("aside", cut.Find("pk-workspace").GetAttribute("active-pane"));
    }

    [Fact]
    public async Task An_unknown_wire_value_keeps_the_current_enum()
    {
        var size = TraySize.Small;
        var cut = Render<PkTray>(p => p.Bind(x => x.Size, size, v => size = v));
        await cut.Find("pk-tray").TriggerEventAsync("onpk-size-change", new PkSizeChangeEventArgs { Size = "huge" });
        Assert.Equal(TraySize.Small, size);
    }
}
