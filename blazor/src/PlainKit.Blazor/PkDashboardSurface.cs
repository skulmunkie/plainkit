namespace PlainKit.Blazor;

/// <summary>A tab of a dashboard route; the route owns the labels.</summary>
public sealed record PkDashboardTab(string Id, string Label);

/// <summary>A composed widget: <c>Key</c> is <c>module:key</c>, the key <c>PkDashboardPage.Load</c> receives.</summary>
public sealed record PkDashboardWidget(string Key, string Label, string Kind, string Tab, string Size);

/// <summary>
/// Optional on a module class (#1296): the data of the widgets its manifest <c>contributes</c>, the C# analogue of the SDK's <c>widgets: { key: { load } }</c>.
/// A widget returns what the card draws (a stat's value, a chart's properties), never markup. Throwing shows that card's error state with Retry.
/// </summary>
public interface IPkWidgets
{
    /// <summary>The data for one of this module's contributed widgets, by its manifest <c>key</c>.</summary>
    Task<object?> LoadWidget(string key);
}

/// <summary>C# port of <c>compose</c> (core/js/app/pages/dashboard-compose.js, #494): <c>core/tests/fixtures/dashboard-compose.json</c> is read by both test suites.</summary>
public static class PkDashboardSurface
{
    /// <summary>The tabs and widgets of a surface: contributions that name it, ordered by <c>order</c> (default 100), then module position, then declaration. A tab the route did not declare is added, titled by its id; a tab with no widgets is dropped.</summary>
    public static (IReadOnlyList<PkDashboardTab> Tabs, IReadOnlyList<PkDashboardWidget> Widgets) Compose(IEnumerable<PkModuleManifest> modules, string surface, IEnumerable<PkDashboardTab>? declared = null)
    {
        var tabs = (declared ?? []).ToList();
        var first = tabs.Count > 0 ? tabs[0].Id : "main";
        var found = new List<(double Order, int Pos, int I, PkDashboardWidget W)>();
        var pos = 0;
        foreach (var m in modules)
        {
            var i = 0;
            foreach (var c in m.Contributes ?? [])
            {
                if (c.For.Contains(surface))
                {
                    var tab = c.Tab ?? first;
                    if (!tabs.Any(t => t.Id == tab)) tabs.Add(new(tab, tab));
                    found.Add((c.Order ?? 100, pos, i, new($"{m.Id}:{c.Key}", c.Label, c.Kind, tab, c.Size ?? "md")));
                }
                i++;
            }
            pos++;
        }
        var widgets = found.OrderBy(f => f.Order).ThenBy(f => f.Pos).ThenBy(f => f.I).Select(f => f.W).ToList();
        return (tabs.Where(t => widgets.Any(w => w.Tab == t.Id)).ToList(), widgets);
    }
}
