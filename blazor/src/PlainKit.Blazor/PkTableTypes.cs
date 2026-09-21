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
/// text <see cref="Text"/> returns, else the property of the item whose camelCase name is <see cref="Key"/>.
/// </remarks>
public sealed record PkTableColumn<TItem>
{
    /// <summary>The field of a row that this column shows (the camelCase name of an item property, or any name when <see cref="Text"/> or <see cref="Cell"/> fills the cell).</summary>
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
