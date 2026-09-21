using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Components;

namespace PlainKit.Blazor;

/// <summary>Which way a <see cref="PkTable{TItem}"/> is sorted.</summary>
public enum PkSortDirection
{
    /// <summary>Smallest first (A to Z, oldest first).</summary>
    Ascending,
    /// <summary>Largest first (Z to A, newest first).</summary>
    Descending,
}

/// <summary>The cell padding step of a <see cref="PkTable{TItem}"/>.</summary>
public enum PkTableDensity
{
    /// <summary>The element's default padding.</summary>
    Default,
    /// <summary>Tighter rows.</summary>
    Compact,
    /// <summary>Roomier rows.</summary>
    Comfortable,
}

internal static class PkTableAttr
{
    internal static string ToAttr(this PkSortDirection value) => value == PkSortDirection.Descending ? "descending" : "ascending";

    internal static string ToAttr(this PkTableDensity value) => value switch
    {
        PkTableDensity.Compact => "compact",
        PkTableDensity.Comfortable => "comfortable",
        _ => "default",
    };
}

/// <summary>A typed column of a <see cref="PkTable{TItem}"/>: the JSON column of <see cref="PkTableColumn"/> plus what fills its cells.</summary>
/// <typeparam name="TItem">The type of a row.</typeparam>
/// <remarks>
/// A cell shows, in this order: the <see cref="Cell"/> template (rendered into the element's <c>cell-&lt;rowId&gt;-&lt;key&gt;</c> slot), else the
/// text <see cref="Text"/> returns, else the property of the item that <see cref="Key"/> names (any casing: <c>Name</c> and <c>name</c> both find
/// the property <c>Name</c>). The key is used exactly as given everywhere: in the column definition, in the row, in the cell slot name, and as the
/// key of <c>Sort</c>, <c>OnSort</c>, <c>Filters</c> and <c>PkListRequest.SortKey</c>. Nothing is renamed, so a host can map it to a repository column as it is.
/// </remarks>
public sealed record PkTableColumn<TItem>
{
    /// <summary>The identity of the column: the row field it shows (the name of an item property in any casing, or any name when <see cref="Text"/> or <see cref="Cell"/> fills the cell). It is used verbatim in the column definition, the row, the cell slot and the sort and filter keys the table reports.</summary>
    public string Key { get; init; } = "";

    /// <summary>The header text.</summary>
    public string Label { get; init; } = "";

    /// <summary>What the column holds; it decides how the element sorts and filters the column when it is not in manual mode. Null leaves it to the element (text).</summary>
    public PkTableColumnType? Type { get; init; }

    /// <summary>The alignment of the cells; null leaves it to the element (start, or end for a number).</summary>
    public PkTableColumnAlign? Align { get; init; }

    /// <summary>The header can be activated to sort by this column (the table reports it; in manual mode you re-query).</summary>
    public bool Sortable { get; init; }

    /// <summary>Leave the column out of the card layout on a phone.</summary>
    public bool HidePhone { get; init; }

    /// <summary>The cell as text, computed from the item (a formatted date, an amount). Sent in the row under <see cref="Key"/>.</summary>
    public Func<TItem, string?>? Text { get; init; }

    /// <summary>The cell as markup (a chip, a link, an icon). Rendered as the child of the slot of that cell; the element shows it in place of the text.</summary>
    public RenderFragment<TItem>? Cell { get; init; }

    // Text fills the row under Key verbatim (the same key the column definition carries); PkTableRows.Serialize adds the property fallback.
    internal PkTableColumn ToColumn() => new()
    {
        Key = Key,
        Label = Label,
        Type = Type,
        Align = Align,
        Sortable = Sortable,
        HidePhone = HidePhone,
    };
}

/// <summary>A row of a <see cref="PkTable{TItem}"/> was activated (a click on a <c>Clickable</c> table).</summary>
/// <typeparam name="TItem">The type of a row.</typeparam>
/// <param name="Id">The row's id, as <c>IdOf</c> gave it (the row's index when there is no <c>IdOf</c>).</param>
/// <param name="Item">The item of that row.</param>
public sealed record PkTableRowClickArgs<TItem>(string Id, TItem Item);

/// <summary>A row of a <see cref="PkTable{TItem}"/> was expanded or collapsed by the user.</summary>
/// <typeparam name="TItem">The type of a row.</typeparam>
/// <param name="Id">The row's id.</param>
/// <param name="Item">The item of that row.</param>
/// <param name="Expanded">The new state: true when the row is now open.</param>
public sealed record PkTableRowExpandArgs<TItem>(string Id, TItem Item, bool Expanded);

internal static class PkTableRows
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    // The row object is written as a whole: its keys are the item's camelCase properties and the column keys as given, so no key policy may rename them (the Web options camelCase dictionary keys).
    private static readonly JsonSerializerOptions Verbatim = new(JsonSerializerDefaults.Web) { DictionaryKeyPolicy = null, PropertyNamingPolicy = null };

    /// <summary>The JSON of the rows array, with every key as <see cref="Serialize{TItem}"/> wrote it.</summary>
    internal static string ToJson(JsonArray rows) => rows.ToJsonString(Verbatim);

    /// <summary>The row object of an item: its public properties (camelCase), each column's <c>Text</c> under the column's key exactly as given, and, for a column that has neither <c>Text</c> nor a property of exactly that name, the property the key names in any casing (so a PascalCase key finds <c>Name</c>).</summary>
    internal static JsonObject Serialize<TItem>(TItem item, IEnumerable<PkTableColumn<TItem>> columns)
    {
        // A JsonObject made by the Web options finds properties without regard to case ("Name" would overwrite "name"), so the row is a fresh, case-sensitive object.
        var node = new JsonObject();
        if (JsonSerializer.SerializeToNode(item, Web) is JsonObject fields)
            foreach (var (name, value) in fields) node[name] = value?.DeepClone();
        foreach (var column in columns)
        {
            if (column.Text is { } text) node[column.Key] = text(item);
            else if (!node.ContainsKey(column.Key) && Find(node, column.Key) is { } found) node[column.Key] = found.DeepClone();
        }
        return node;
    }

    /// <summary>The property of a serialized item that a column key names, ignoring case; null when there is none.</summary>
    internal static JsonNode? Find(JsonObject node, string key)
    {
        if (node.TryGetPropertyValue(key, out var exact)) return exact;
        foreach (var (name, value) in node)
            if (string.Equals(name, key, StringComparison.OrdinalIgnoreCase)) return value;
        return null;
    }
}
