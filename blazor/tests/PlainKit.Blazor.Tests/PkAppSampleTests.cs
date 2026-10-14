using System.Reflection;
using System.Text.RegularExpressions;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.AppSample.Modules;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #364 step 5: the sample app (blazor/samples/PlainKit.AppSample) keeps to its manifests, its @page routes and the cleanup rules.
public sealed class PkAppSampleTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private static string Core(string id)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "core", "samples", "app", "manifests", id + ".json");
            if (File.Exists(file)) return File.ReadAllText(file);
        }
        throw new FileNotFoundException(id + ".json");
    }

    // Line endings are normalized: tracked files under core/ are CRLF (.gitattributes), the sample's copies are not.
    private static string Lf(string s) => s.Replace("\r\n", "\n");

    [Theory, InlineData("overview"), InlineData("orders"), InlineData("reports")]
    public void The_embedded_manifest_is_the_SDK_samples_manifest(string id) => Assert.Equal(Lf(Core(id)), Lf(SampleModule.Read(id)));

    // "/orders/:id" and "/orders/{Id}" are the same shape.
    private static string Shape(string p) => Regex.Replace(p, @"(:\w+|\{\w+\})", "{}").ToLowerInvariant();

    private static IEnumerable<string> ManifestPaths(string module, IEnumerable<PkManifestRoute>? routes) =>
        (routes ?? []).SelectMany(r => (r.Path == "*" ? [] : new[] { Shape("/" + module + (r.Path == "/" ? "" : r.Path)) }).Concat(ManifestPaths(module, r.Children)));

    [Theory, InlineData("overview"), InlineData("orders"), InlineData("reports")]
    public void The_manifest_routes_and_the_page_templates_agree(string id)
    {
        var module = new IPkModule[] { new OverviewModule(), new OrdersModule(), new ReportsModule() }.First(m => m.Manifest.Id == id);
        var pages = typeof(OrderStore).Assembly.GetTypes().SelectMany(t => t.GetCustomAttributes<RouteAttribute>()).Select(a => Shape(a.Template)).ToHashSet();
        var declared = ManifestPaths(id, module.Manifest.Routes).ToHashSet();
        Assert.True(declared.IsSubsetOf(pages), "manifest route without @page: " + string.Join(", ", declared.Except(pages)));
        var extra = pages.Where(p => (p == "/" + id || p.StartsWith("/" + id + "/")) && !declared.Contains(p)).ToList();
        Assert.True(extra.Count == 0, "@page missing from the manifest: " + string.Join(", ", extra));
    }

    [Fact]
    public void Mounting_and_disposing_the_app_100_times_leaves_no_location_handler()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Module<OverviewModule>().Module<OrdersModule>().Module<ReportsModule>());
        var nav = Services.GetRequiredService<NavigationManager>();
        int Handlers() => ((Delegate?)typeof(NavigationManager).GetField("_locationChanged", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(nav))?.GetInvocationList().Length ?? 0;
        var before = Handlers();
        for (var i = 0; i < 100; i++) { var cut = Render<PkApp>(); ((IDisposable)cut.Instance).Dispose(); }
        Assert.Equal(before, Handlers());
    }
}
