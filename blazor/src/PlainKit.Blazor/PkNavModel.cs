namespace PlainKit.Blazor;

/// <summary>Where the reader is in an app: the module, its nav row ids and current row, the App > Module > ... trail and the title.</summary>
public sealed record PkNavLocation(string Module, IReadOnlyList<string> Ids, string? Current, IReadOnlyList<PkCrumb> Crumbs, string Title);

/// <summary>C# port of <c>appLocate</c> (core/tools/app-manifest.mjs, #364): <c>core/tests/fixtures/app-nav.json</c> is read by both test suites. Built on <see cref="PkPageContext"/>.</summary>
public static class PkNavModel
{
    /// <summary>The location of an app-wide path such as <c>/orders/open</c>: the first segment names the module, the rest is module-relative. Null for an unknown module.</summary>
    public static PkNavLocation? Locate(IEnumerable<PkModuleManifest> modules, string brand, string path)
    {
        var parts = path.Split('?', '#')[0].Split('/', StringSplitOptions.RemoveEmptyEntries);
        var m = parts.Length > 0 ? modules.FirstOrDefault(x => x.Id == parts[0]) : null;
        if (m is null) return null;
        var own = "/" + string.Join('/', parts.Skip(1));
        var ctx = PkPageContext.Compute(Routes(m.Routes), Nav(m.Nav), own);
        var inner = own == "/" ? [] : ctx.Crumbs.Where(c => c.Href != "/").Select(c => c with { Href = c.Href is null ? null : $"/{m.Id}{c.Href}" }).ToList();
        return new(m.Id, ctx.Ids, ctx.Current, [new(brand, "/"), new(m.Title, $"/{m.Id}"), .. inner], inner.Count > 0 ? inner[^1].Label : m.Title);
    }

    private static List<PkRoute> Routes(IReadOnlyList<PkManifestRoute>? r) => (r ?? []).Select(x => new PkRoute(x.Path, x.Label, Children: Routes(x.Children))).ToList();

    private static List<PkNavEntry> Nav(IReadOnlyList<PkManifestNavItem>? n) => (n ?? []).Select(x => new PkNavEntry(x.Id, x.Title, x.Route, Nav(x.Children))).ToList();
}
