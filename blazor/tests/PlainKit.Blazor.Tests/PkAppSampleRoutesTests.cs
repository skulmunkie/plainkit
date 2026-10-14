using Bunit;
using Bunit.TestDoubles;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.AppSample.Components;
using PlainKit.AppSample.Modules;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #364: the sample's whole frame (Routes.razor) at the routes the browser cases are about: a deep link to a record, the refusal page for an [Authorize] page, and not found.
// bUnit has no real navigation or module assembly load, so the lazy-load and focus cases need a browser host (see the PR description).
public sealed class PkAppSampleRoutesTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private IRenderedComponent<Routes> At(string path, bool signedIn = false)
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var auth = AddAuthorization();
        if (signedIn) auth.SetAuthorized("ada"); else auth.SetNotAuthorized();
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Module<OverviewModule>().Module<OrdersModule>().Module<ReportsModule>());
        Services.GetRequiredService<NavigationManager>().NavigateTo(path);
        return Render<Routes>();
    }

    [Fact]
    public void A_deep_link_renders_the_record_inside_the_frame()
    {
        var cut = At("/orders/8");
        Assert.NotNull(cut.Find("pk-app-frame"));
        Assert.Contains("Order 8", cut.Find("pk-record-page").GetAttribute("config"));
    }

    [Fact]
    public void An_authorize_page_shows_not_allowed_to_nobody_signed_in()
    {
        var cut = At("/secure/audit");
        Assert.Contains("Not allowed", cut.Markup);
        Assert.DoesNotContain("Only signed-in users reach this page.", cut.Markup);
    }

    [Fact]
    public void An_authorize_page_renders_for_a_signed_in_user() => Assert.Contains("Audit log", At("/secure/audit", signedIn: true).Markup);

    [Fact]
    public void An_unknown_route_renders_the_not_found_page()
    {
        var cut = At("/orders/no/such/page");
        Assert.DoesNotContain("pk-record-page", cut.Markup);
        Assert.Contains("pk-app-frame", cut.Markup);
    }
}
