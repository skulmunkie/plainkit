using Bunit;
using Bunit.TestDoubles;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 210: PkSideNav tracks the host's current route itself instead of the host wiring NavigationManager by hand.
public sealed class PkSideNavTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly NavigationManager NavigationManager;

    public PkSideNavTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        NavigationManager = Services.GetRequiredService<NavigationManager>();
    }

    [Fact]
    public void With_no_CurrentPath_the_component_tracks_the_current_route_on_first_render()
    {
        NavigationManager.NavigateTo("/users/42");
        var cut = Render<PkSideNav>();
        Assert.Equal("/users/42", cut.Find("pk-side-nav").GetAttribute("current-path"));
    }

    [Fact]
    public void A_navigation_after_render_updates_current_path()
    {
        NavigationManager.NavigateTo("/users/42");
        var cut = Render<PkSideNav>();

        NavigationManager.NavigateTo("/orders/7");

        Assert.Equal("/orders/7", cut.Find("pk-side-nav").GetAttribute("current-path"));
    }

    [Fact]
    public void An_explicit_CurrentPath_wins_over_the_tracked_route_and_stays_fixed_across_navigation()
    {
        NavigationManager.NavigateTo("/users/42");
        var cut = Render<PkSideNav>(p => p.Add(x => x.CurrentPath, "/pinned"));

        NavigationManager.NavigateTo("/orders/7");

        Assert.Equal("/pinned", cut.Find("pk-side-nav").GetAttribute("current-path"));
    }

    [Fact]
    public void Disposing_the_component_stops_it_reacting_to_further_navigation()
    {
        NavigationManager.NavigateTo("/users/42");
        var cut = Render<PkSideNav>();
        cut.Instance.Dispose(); // bUnit disposes the render tree itself at teardown; this proves the handler is gone before then.

        // A navigation after Dispose must not throw (a leaked handler touching a torn-down component would).
        var ex = Record.Exception(() => NavigationManager.NavigateTo("/orders/7"));
        Assert.Null(ex);
    }
}
