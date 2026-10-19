using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #364 step 2: PkNavModel.Locate against core/tests/fixtures/app-nav.json, which core/tests/app-manifest.test.mjs also reads through appLocate: JS and C# must agree on every case.
public sealed class PkNavModelTests
{
    private static readonly JsonElement Fixture = Load();

    private static JsonElement Load()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "core", "tests", "fixtures", "app-nav.json");
            if (File.Exists(file)) return JsonDocument.Parse(File.ReadAllText(file)).RootElement;
        }
        throw new FileNotFoundException("core/tests/fixtures/app-nav.json");
    }

    public static IEnumerable<object[]> Cases() => Fixture.GetProperty("cases").EnumerateArray().Select(c => new object[] { c.GetProperty("name").GetString()! });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_fixture(string name)
    {
        var modules = Fixture.GetProperty("modules").EnumerateArray().Select(m => PkModuleManifest.FromJson(m.GetRawText())).ToList();
        var c = Fixture.GetProperty("cases").EnumerateArray().First(x => x.GetProperty("name").GetString() == name);
        var got = PkNavModel.Locate(modules, Fixture.GetProperty("brand").GetString()!, c.GetProperty("path").GetString()!);
        var want = c.GetProperty("expect");
        if (want.ValueKind == JsonValueKind.Null) { Assert.Null(got); return; }
        Assert.NotNull(got);
        Assert.Equal(want.GetProperty("module").GetString(), got.Module);
        Assert.Equal(want.GetProperty("ids").EnumerateArray().Select(x => x.GetString()), got.Ids);
        Assert.Equal(want.GetProperty("current").GetString(), got.Current);
        Assert.Equal(want.GetProperty("title").GetString(), got.Title);
        Assert.Equal(want.GetProperty("crumbs").EnumerateArray().Select(x => $"{x.GetProperty("label").GetString()}|{(x.TryGetProperty("href", out var h) ? h.GetString() : null)}"), got.Crumbs.Select(x => $"{x.Label}|{x.Href}"));
    }

    private sealed class A : IPkModule { public PkModuleManifest Manifest => new() { Id = "a", Title = "A" }; }
    private sealed class Bad : IPkModule { public PkModuleManifest Manifest => new() { Id = "Bad Id", Title = "B" }; }

    [Fact]
    public void Catalog_keeps_order_and_settings()
    {
        var sp = new ServiceCollection().AddPlainKitApp(a => a.Brand("Demo").Module<A>().Home("a").Footer("f")).BuildServiceProvider();
        var cat = sp.GetRequiredService<PkModuleCatalog>();
        Assert.Equal(("Demo", "a", "f"), (cat.Brand, cat.Home, cat.Footer));
        Assert.Equal("A", cat.Get("a")!.Manifest.Title);
        Assert.Null(cat.Get("zz"));
    }

    [Fact]
    public void Registration_refuses_a_bad_duplicate_or_unknown_home()
    {
        Assert.Throws<ArgumentException>(() => new ServiceCollection().AddPlainKitApp(a => a.Module<Bad>()));
        Assert.Throws<ArgumentException>(() => new ServiceCollection().AddPlainKitApp(a => a.Module<A>().Module<A>()));
        Assert.Throws<ArgumentException>(() => new ServiceCollection().AddPlainKitApp(a => a.Module<A>().Home("nope")));
    }

    [Fact]
    public void A_wildcard_nav_route_keeps_its_row_current_for_a_record_path()
    {
        var m = PkModuleManifest.FromJson("""{"id":"stock","title":"Stock","nav":[{"id":"ledger","title":"Ledger","route":"/ledger/*"}]}""");
        var loc = PkNavModel.Locate([m], "App", "/stock/ledger/41/lines")!;
        Assert.Equal("ledger", loc.Current);
        Assert.Equal(["ledger"], loc.Ids);
    }
}
