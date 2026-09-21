using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using PlainKit.Blazor;
using PlainKit.WasmPlayground;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// No server: the SDK's log entries are forwarded to ILogger, which the browser's console logger writes to the console.
builder.Logging.SetMinimumLevel(LogLevel.Information);
builder.Services.AddPlainKit(o =>
{
    o.Logging.Level = PkLogLevel.Info;
    o.Logging.ForwardToILogger = true;
    o.Logging.ForwardMinimumLevel = PkLogLevel.Info;
});

await builder.Build().RunAsync();
