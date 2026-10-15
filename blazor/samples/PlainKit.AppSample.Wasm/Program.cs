using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.AspNetCore.Components.WebAssembly.Services;
using PlainKit.AppSample;
using PlainKit.AppSample.Modules;
using PlainKit.Blazor;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddPlainKit();
builder.Services.AddPlainKitApp(app => app.Brand("Demo app").Module<OverviewModule>().Module<InsightsModule>().Home("overview").Footer("Plainkit WebAssembly demo app"));
// The two lines a WebAssembly host adds for lazy modules: the loader gets the platform's LazyAssemblyLoader, and registering it as the IPkModuleLoader is what turns the loading on (Server registers none).
builder.Services.AddSingleton(sp => new PkLazyModuleLoader(sp.GetRequiredService<PkModuleCatalog>(), names => sp.GetRequiredService<LazyAssemblyLoader>().LoadAssembliesAsync(names)));
builder.Services.AddSingleton<IPkModuleLoader>(sp => sp.GetRequiredService<PkLazyModuleLoader>());

await builder.Build().RunAsync();
