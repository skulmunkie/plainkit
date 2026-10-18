using Microsoft.AspNetCore.Components.Authorization;
using PlainKit.AppSample.Components;
using PlainKit.AppSample.Modules;
using PlainKit.Blazor;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents().AddInteractiveServerComponents();
builder.Services.AddPlainKit(o => o.DevTools = true); // the dev tools page (/_plainkit) is on in the harness, which runs the sample in Production
builder.Services.AddPlainKitApp(app => app
    .Brand("Demo app")
    .Module<OverviewModule>().Module<OrdersModule>().Module<ReportsModule>()
    .Home("overview").Footer("Plainkit demo app"));

// The [Authorize] demonstration (/secure/audit): nobody is signed in here, so the page shows "not authorized". The module guard only hides; this is the real check.
builder.Services.AddAuthorizationCore().AddCascadingAuthenticationState();
builder.Services.AddScoped<AuthenticationStateProvider, Anonymous>();
// The endpoint authorization middleware also challenges a first request for an [Authorize] page, which needs an authentication scheme; this one never signs anyone in and answers 401, which the status page below renders in the frame.
builder.Services.AddAuthentication("none").AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, NoSignIn>("none", null);

var app = builder.Build();
app.UseStaticFiles();
// A first request the host answers with an empty 401/404 (an [Authorize] page, a path no @page matches) is re-run through the Razor app, so the frame and the refusal or not-found page come back like they do on client navigation.
app.UseStatusCodePagesWithReExecute("/status/{0}", createScopeForStatusCodePages: true);
// Routing and authorization are placed by hand: the host would otherwise put them before the status pages, which then never see the 401.
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapStaticAssets();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode().AddPlainKitDevTools();
app.Run();

sealed class NoSignIn(Microsoft.Extensions.Options.IOptionsMonitor<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions> o, Microsoft.Extensions.Logging.ILoggerFactory l, System.Text.Encodings.Web.UrlEncoder e)
    : Microsoft.AspNetCore.Authentication.AuthenticationHandler<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions>(o, l, e)
{
    protected override Task<Microsoft.AspNetCore.Authentication.AuthenticateResult> HandleAuthenticateAsync() => Task.FromResult(Microsoft.AspNetCore.Authentication.AuthenticateResult.NoResult());
}

sealed class Anonymous : AuthenticationStateProvider
{
    public override Task<AuthenticationState> GetAuthenticationStateAsync() => Task.FromResult(new AuthenticationState(new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity())));
}

public partial class Program;
