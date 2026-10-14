using Microsoft.AspNetCore.Components.Authorization;
using PlainKit.AppSample.Components;
using PlainKit.AppSample.Modules;
using PlainKit.Blazor;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents().AddInteractiveServerComponents();
builder.Services.AddPlainKit();
builder.Services.AddPlainKitApp(app => app
    .Brand("Demo app")
    .Module<OverviewModule>().Module<OrdersModule>().Module<ReportsModule>()
    .Home("overview").Footer("Plainkit demo app"));

// The [Authorize] demonstration (/secure/audit): nobody is signed in here, so the page shows "not authorized". The module guard only hides; this is the real check.
builder.Services.AddAuthorizationCore().AddCascadingAuthenticationState();
builder.Services.AddScoped<AuthenticationStateProvider, Anonymous>();

var app = builder.Build();
app.UseStaticFiles();
app.UseAntiforgery();
app.MapStaticAssets();
app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();

sealed class Anonymous : AuthenticationStateProvider
{
    public override Task<AuthenticationState> GetAuthenticationStateAsync() => Task.FromResult(new AuthenticationState(new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity())));
}

public partial class Program;
