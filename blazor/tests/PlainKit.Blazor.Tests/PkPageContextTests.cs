using System.Text.Json;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 670: PkPageContext.Compute against core/tests/fixtures/page-context.json, which core/tests/page-context-fixture.test.mjs also reads: JS and C# must agree on every case.
public sealed class PkPageContextTests
{
    private static readonly JsonElement Fixture = JsonDocument.Parse(File.ReadAllText(FixturePath())).RootElement;

    private static string FixturePath()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "core", "tests", "fixtures", "page-context.json");
            if (File.Exists(file)) return file;
        }
        throw new FileNotFoundException("core/tests/fixtures/page-context.json");
    }

    public static IEnumerable<object[]> Cases() => Fixture.GetProperty("cases").EnumerateArray().Select(c => new object[] { c.GetProperty("name").GetString()! });

    private static string? Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static List<PkRoute> Routes(JsonElement list) => list.EnumerateArray()
        .Select(r => new PkRoute(Str(r, "path"), Str(r, "label"), Str(r, "labelParam"), !r.TryGetProperty("crumb", out var c) || c.GetBoolean(), Children: r.TryGetProperty("children", out var k) ? Routes(k) : null, Under: Str(r, "under"))).ToList();

    private static List<PkNavEntry> Nav(JsonElement list) => list.EnumerateArray()
        .Select(n => new PkNavEntry(Str(n, "id")!, Str(n, "title")!, Str(n, "route"), n.TryGetProperty("children", out var k) ? Nav(k) : null)).ToList();

    private static List<PkCrumb> Crumbs(JsonElement list) => list.EnumerateArray().Select(c => new PkCrumb(Str(c, "label")!, Str(c, "href"))).ToList();

    private static List<string> Ids(JsonElement list) => list.EnumerateArray().Select(i => i.GetString()!).ToList();

    [Theory]
    [MemberData(nameof(Cases))]
    public void ComputeMatchesTheSharedFixture(string name)
    {
        var c = Fixture.GetProperty("cases").EnumerateArray().Single(x => x.GetProperty("name").GetString() == name);
        PkPageContextOverride? over = c.TryGetProperty("override", out var o)
            ? new(o.TryGetProperty("ids", out var ids) ? Ids(ids) : null, o.TryGetProperty("crumbs", out var cr) ? Crumbs(cr) : null, Str(o, "title"))
            : null;
        var got = PkPageContext.Compute(Routes(Fixture.GetProperty("routes")), Nav(Fixture.GetProperty("nav")), c.GetProperty("path").GetString()!, over);
        var want = c.GetProperty("expect");
        Assert.Equal(Ids(want.GetProperty("ids")), got.Ids);
        Assert.Equal(Str(want, "section"), got.Section);
        Assert.Equal(Str(want, "current"), got.Current);
        Assert.Equal(Crumbs(want.GetProperty("crumbs")), got.Crumbs);
        Assert.Equal(Str(want, "title"), got.Title);
    }
}
