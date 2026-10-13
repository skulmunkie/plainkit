using System.Text.Json;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #364: the generated PkModuleManifest reads the manifests of core/tests/fixtures/app-nav.json (the file core/tests/app-manifest.test.mjs reads through readManifest) and refuses what readManifest refuses.
public sealed class PkModuleManifestTests
{
    private static JsonElement Fixture()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "core", "tests", "fixtures", "app-nav.json");
            if (File.Exists(file)) return JsonDocument.Parse(File.ReadAllText(file)).RootElement;
        }
        throw new FileNotFoundException("core/tests/fixtures/app-nav.json");
    }

    [Fact]
    public void Reads_every_fixture_module()
    {
        var modules = Fixture().GetProperty("modules").EnumerateArray().Select(m => PkModuleManifest.FromJson(m.GetRawText())).ToList();
        Assert.Equal(new[] { "overview", "orders" }, modules.Select(m => m.Id));
        var orders = modules[1];
        Assert.Equal(new[] { "all", "open" }, orders.Nav!.Select(n => n.Id));
        Assert.Equal("record", orders.Routes![0].Children![0].Page);
        Assert.Equal("Run by Finance", orders.Footer!.Text);
        Assert.Equal("/help", orders.Footer.Links![0].Href);
    }

    [Theory]
    [InlineData("{\"id\":\"a\",\"title\":\"A\",\"can\":true}")]
    [InlineData("{\"id\":\"A\",\"title\":\"A\"}")]
    [InlineData("{\"id\":\"a\",\"title\":\"A\",\"nav\":[{\"id\":\"x\",\"title\":\"X\",\"color\":\"red\"}]}")]
    [InlineData("{\"id\":\"a\",\"title\":\"A\",\"routes\":[{\"path\":\"/\"}]}")]
    public void Refuses_what_readManifest_refuses(string json) => Assert.ThrowsAny<JsonException>(() => PkModuleManifest.FromJson(json));
}
