using PlainKit.Blazor;
using PlainKit.Playground.Components;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents().AddInteractiveServerComponents();

// The Files tab browses this repository, so the tools are used on the project that ships them. Not needed in a normal app (it defaults to the
// content root); the published copy of the toolkit is skipped because it is a byte-for-byte copy of core/dist.
builder.Services.AddPlainKit(o =>
{
    o.SourceRoot = FindRepoRoot();
    o.SourceExclude = dir => dir == "blazor/src/PlainKit.Blazor/wwwroot/plainkit";
    o.Logging.Level = PkLogLevel.Info;            // the /generated page checks that SDK entries reach ILogger
    o.Logging.ForwardToILogger = true;
    o.Logging.ForwardMinimumLevel = PkLogLevel.Info;
});

var app = builder.Build();
app.UseStaticFiles();
app.UseAntiforgery();
app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddPlainKitDevTools(); // makes the /_plainkit dev tools page routable
app.Run();

static string FindRepoRoot()
{
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        if (File.Exists(Path.Combine(dir.FullName, "Directory.Build.props"))) return dir.FullName;
    return Directory.GetCurrentDirectory();
}
