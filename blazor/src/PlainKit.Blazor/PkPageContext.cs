namespace PlainKit.Blazor;

/// <summary>A node of a route tree: <see cref="Path"/> may hold <c>:name</c> segments, <c>*</c> is the not-found route, a null path is a group. The label is <see cref="Label"/>, or the value of the route parameter <see cref="LabelParam"/>.</summary>
public sealed record PkRoute(string? Path, string? Label = null, string? LabelParam = null, bool Crumb = true, string? Id = null, IReadOnlyList<PkRoute>? Children = null);

/// <summary>An entry of a navigation tree: the entry whose <see cref="Route"/> matches says which row is current.</summary>
public sealed record PkNavEntry(string Id, string Title, string? Route = null, IReadOnlyList<PkNavEntry>? Children = null);

/// <summary>An explicit answer that wins field by field over the one derived from the address.</summary>
public sealed record PkPageContextOverride(IReadOnlyList<string>? Ids = null, IReadOnlyList<PkCrumb>? Crumbs = null, string? Title = null);

/// <summary>Where the reader is (#670): the nav row ids, the breadcrumb trail and the title. The same algorithm as <c>core/js/page-context.js</c>; <c>core/tests/fixtures/page-context.json</c> is read by both test suites, so the two cannot drift.</summary>
public sealed record PkPageContext(IReadOnlyList<string> Ids, string? Section, string? Current, IReadOnlyList<PkCrumb> Crumbs, string Title)
{
    /// <summary>The context of <paramref name="path"/> given the route tree, the nav tree and an optional override.</summary>
    public static PkPageContext Compute(IReadOnlyList<PkRoute> routes, IReadOnlyList<PkNavEntry> nav, string path, PkPageContextOverride? over = null)
    {
        var (found, trail) = Locate(routes, Tree(nav), path);
        IReadOnlyList<string> ids = over?.Ids ?? found;
        IReadOnlyList<PkCrumb> crumbs = over?.Crumbs ?? trail;
        if (over?.Title is { } t && over.Crumbs is null && crumbs.Count > 0) crumbs = [.. crumbs.Take(crumbs.Count - 1), crumbs[^1] with { Label = t }];
        var title = over?.Title ?? (crumbs.Count > 0 ? crumbs[^1].Label : "");
        return new(ids, ids.FirstOrDefault(), ids.LastOrDefault(), crumbs, title);
    }

    private sealed record Hit(PkRoute Node, List<PkRoute> Chain, Dictionary<string, string> Params, bool NotFound);

    private static List<PkRoute> Tree(IReadOnlyList<PkNavEntry> nav) => nav.Select(n => new PkRoute(n.Route, n.Title, Id: n.Id, Children: Tree(n.Children ?? []))).ToList();

    private static string[] Segments(string path) => path.Split('?', '#')[0].Split('/', StringSplitOptions.RemoveEmptyEntries);

    private static IEnumerable<(PkRoute Node, List<PkRoute> Chain)> Flatten(IEnumerable<PkRoute> routes, List<PkRoute>? parents = null)
    {
        foreach (var node in routes)
        {
            var chain = new List<PkRoute>(parents ?? []) { node };
            yield return (node, chain);
            foreach (var x in Flatten(node.Children ?? [], chain)) yield return x;
        }
    }

    // The route matching the path; static segments beat a :param, the first declared wins a tie, '*' answers only when nothing else does.
    private static Hit? Match(IEnumerable<PkRoute> routes, string path)
    {
        var want = Segments(path);
        Hit? star = null, best = null;
        var bestStatics = -1;
        foreach (var (node, chain) in Flatten(routes))
        {
            if (node.Path is null) continue;
            if (node.Path == "*") { star ??= new(node, chain, [], true); continue; }
            var have = Segments(node.Path);
            if (have.Length != want.Length) continue;
            Dictionary<string, string> ps = [];
            var statics = 0;
            var ok = true;
            for (var i = 0; i < have.Length && ok; i++)
            {
                if (have[i][0] == ':') ps[have[i][1..]] = Uri.UnescapeDataString(want[i]);
                else { statics++; ok = have[i] == want[i]; }
            }
            if (ok && statics > bestStatics) { best = new(node, chain, ps, false); bestStatics = statics; }
        }
        return best ?? star;
    }

    private static string Fill(string path, Dictionary<string, string> ps) => "/" + string.Join('/', Segments(path).Select(s => s[0] == ':' ? Uri.EscapeDataString(ps.GetValueOrDefault(s[1..], "")) : s));

    private static string LabelOf(PkRoute n, Dictionary<string, string> ps) => (n.LabelParam is { } k ? ps.GetValueOrDefault(k) : n.Label) ?? "";

    private static List<PkCrumb> Strip(List<PkCrumb> l) => l.Count > 0 ? [.. l.Take(l.Count - 1), new(l[^1].Label)] : l;

    private static List<PkCrumb> Trail(IEnumerable<PkRoute> nodes, Dictionary<string, string> ps) =>
        nodes.Where(n => (n.Label ?? n.LabelParam) is not null && n.Crumb).Select(n => new PkCrumb(LabelOf(n, ps), n.Path is null ? null : Fill(n.Path, ps))).ToList();

    private static List<PkCrumb> Built(IEnumerable<PkRoute> chain, Dictionary<string, string> ps) =>
        Strip(chain.Where(n => n.Crumb).Select(n => new PkCrumb(LabelOf(n, ps), n.Path is null || n.Path == "*" ? null : Fill(n.Path, ps))).ToList());

    // The ids from the nav entry's top ancestor down to the entry the route chain belongs to (the deepest route on the way that is a nav entry), and the trail.
    private static (List<string> Ids, List<PkCrumb> Crumbs) Locate(IReadOnlyList<PkRoute> routes, List<PkRoute> tree, string path)
    {
        var m = Match(routes, path);
        var chain = m is { NotFound: false } ? m.Chain : [];
        var ps = m?.Params ?? [];
        var entries = Flatten(tree).Where(x => x.Node.Path is not null).ToList();
        for (var i = chain.Count - 1; i >= 0; i--)
        {
            var hit = entries.FirstOrDefault(x => x.Node.Path == chain[i].Path);
            if (hit.Node is null) continue;
            var own = Built(hit.Chain, ps);
            if (own.Count > 0) own[^1] = own[^1] with { Href = Fill(hit.Node.Path!, ps) };
            return (hit.Chain.Select(n => n.Id ?? "").ToList(), Strip([.. own, .. Trail(chain.Skip(i + 1), ps)]));
        }
        var direct = Match(tree, path);
        if (direct is { NotFound: false }) return (direct.Chain.Select(n => n.Id ?? "").ToList(), Built(direct.Chain, direct.Params));
        return ([], Strip(Trail(chain, ps)));
    }
}
