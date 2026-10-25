using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace PlainKit.Blazor.Testing;

public static partial class PkPageTesting
{
    /// <summary>The filter definitions the list page sends its element (config <c>filters</c>: each <c>{ key, type, label, options? }</c>), empty when it has none (#1779). Options a <c>Load</c> returns are in the <c>FilterOptions</c> of the result of <c>LoadAsync</c>.</summary>
    public static JsonArray Filters<TItem>(this Pages.PkListPage<TItem> page) => page.Sent()["filters"] as JsonArray ?? [];

    /// <summary>The address the element links this row's first cell to with <c>RowHrefTemplate</c> (each <c>{field}</c> is the camel-case property, <c>{id}</c> the <c>IdOf</c> key, URL-encoded), or null without a template or for an address that is not a same-site path or a hash, as in the browser (#1779).</summary>
    public static string? RowHref<TItem>(this Pages.PkListPage<TItem> page, TItem item)
    {
        ArgumentNullException.ThrowIfNull(page);
        if (string.IsNullOrEmpty(page.RowHrefTemplate)) return null;
        var row = JsonSerializer.SerializeToNode(item, new JsonSerializerOptions(JsonSerializerDefaults.Web)) as JsonObject;
        var url = Regex.Replace(page.RowHrefTemplate, @"\{(\w+)\}", m => Uri.EscapeDataString(m.Groups[1].Value == "id" ? page.IdOf?.Invoke(item) ?? row?["id"]?.ToString() ?? "" : row?[m.Groups[1].Value]?.ToString() ?? ""));
        return Regex.IsMatch(url, @"^(/(?![/\\])|#)") && !Regex.IsMatch(url, @"[\x00-\x20\x7f]") ? url : null;
    }
}
