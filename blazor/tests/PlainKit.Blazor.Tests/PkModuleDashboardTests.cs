using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.AppSample.Modules;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #1296: a dashboard composed from what the modules' manifests contribute. PkDashboardSurface is read against core/tests/fixtures/dashboard-compose.json
// (the file core/tests/app-manifest-contributes.test.mjs reads through the SDK's compose); PkModuleDashboard feeds PkDashboardPage and answers its Load.
public sealed class PkModuleDashboardTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private static JsonElement Fixture()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "core", "tests", "fixtures", "dashboard-compose.json");
            if (File.Exists(file)) return JsonDocument.Parse(File.ReadAllText(file)).RootElement;
        }
        throw new FileNotFoundException("core/tests/fixtures/dashboard-compose.json");
    }

    [Fact]
    public void Composes_every_fixture_case_like_the_SDK()
    {
        var f = Fixture();
        var modules = f.GetProperty("modules").EnumerateArray().Select(m => PkModuleManifest.FromJson(m.GetRawText())).ToList();
        foreach (var c in f.GetProperty("cases").EnumerateArray())
        {
            var declared = c.TryGetProperty("tabs", out var t) ? t.EnumerateArray().Select(x => new PkDashboardTab(x.GetProperty("id").GetString()!, x.GetProperty("label").GetString()!)).ToList() : null;
            var (tabs, widgets) = PkDashboardSurface.Compose(modules, c.GetProperty("surface").GetString()!, declared);
            var expect = c.GetProperty("expect");
            Assert.Equal(expect.GetProperty("tabs").EnumerateArray().Select(x => (x.GetProperty("id").GetString()!, x.GetProperty("label").GetString()!)), tabs.Select(x => (x.Id, x.Label)));
            Assert.Equal(expect.GetProperty("widgets").EnumerateArray().Select(x => Norm(x.GetRawText())),
                widgets.Select(w => JsonSerializer.Serialize(new { key = w.Key, label = w.Label, kind = w.Kind, tab = w.Tab, size = w.Size })).Select(Norm));
        }
    }

    private static string Norm(string json) => JsonSerializer.Serialize(JsonSerializer.Deserialize<JsonElement>(json));

    private BunitJSModuleInterop Setup()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Module<OverviewModule>().Module<OrdersModule>().Module<ReportsModule>());
        return bridge;
    }

    private static readonly PkDashboardTab[] Tabs = [new("sales", "Sales"), new("ops", "Operations")];

    [Fact]
    public void Sends_the_composed_widgets_and_tabs_to_the_dashboard_page()
    {
        Setup();
        var cut = Render<PkModuleDashboard>(p => p.Add(x => x.Surface, "overview").Add(x => x.Heading, "Overview").Add(x => x.Tabs, Tabs));
        var config = JsonDocument.Parse(cut.Find("pk-dashboard-page").GetAttribute("config")!).RootElement;
        Assert.Equal("Overview", config.GetProperty("heading").GetString());
        Assert.Equal(new[] { "sales", "ops" }, config.GetProperty("tabs").EnumerateArray().Select(t => t.GetProperty("id").GetString()));
        Assert.Equal(new[] { "orders:open", "orders:revenue", "reports:exports" }, config.GetProperty("widgets").EnumerateArray().Select(w => w.GetProperty("key").GetString()));
    }

    private async Task<object?> Load(BunitJSModuleInterop bridge, IRenderedComponent<PkModuleDashboard> cut, string key)
    {
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<string>>>(Assert.Single(bridge.Invocations["setCallback"]).Arguments[2]);
        return await cut.InvokeAsync(() => host.Value.Invoke(key));
    }

    [Fact]
    public async Task Load_is_answered_by_the_module_that_owns_the_widget()
    {
        var bridge = Setup();
        var cut = Render<PkModuleDashboard>(p => p.Add(x => x.Surface, "overview").Add(x => x.Tabs, Tabs));
        var result = await Load(bridge, cut, "reports:exports");
        Assert.Equal("3", JsonSerializer.SerializeToElement(result).GetProperty("value").GetString());
    }

    [Theory, InlineData("orders:nope"), InlineData("overview:open"), InlineData("nobody:open"), InlineData("orders:open:x"), InlineData("__proto__")]
    public async Task Load_refuses_a_key_that_is_not_a_composed_widget_of_a_registered_module(string key)
    {
        var bridge = Setup();
        var cut = Render<PkModuleDashboard>(p => p.Add(x => x.Surface, "overview").Add(x => x.Tabs, Tabs));
        await Assert.ThrowsAnyAsync<Exception>(() => Load(bridge, cut, key));
    }
}
