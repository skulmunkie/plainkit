namespace PlainKit.Blazor;

using Microsoft.AspNetCore.Components;

/// <summary>
/// The pk-table "chrome" both <see cref="PkTable{TItem}"/> (data-driven) and <c>PkRawTable</c> (raw/slotted, issue 228) share: appearance,
/// the scroll frame and the named slots that are not tied to typed rows. Kept as one plain class, not a .razor file, since it has no markup
/// of its own -- each derived component still owns its own &lt;pk-table&gt; markup and binds these inherited properties itself.
/// </summary>
public abstract class PkTableBase : PkElementBase
{
    /// <summary>Alternate row tint.</summary>
    [Parameter] public bool Striped { get; set; }

    /// <summary>Tint the row under the pointer.</summary>
    [Parameter] public bool Hover { get; set; }

    /// <summary>Border on every cell.</summary>
    [Parameter] public bool Bordered { get; set; }

    /// <summary>The cell padding step; null leaves the element's default.</summary>
    [Parameter] public PkTableDensity? Density { get; set; }

    /// <summary>Pin the header row (give the table a <see cref="MaxHeight"/>).</summary>
    [Parameter] public bool StickyHeader { get; set; }

    /// <summary>Pin the first column.</summary>
    [Parameter] public bool StickyColumn { get; set; }

    /// <summary>Bounds the scrolling frame (a CSS length, for example <c>24rem</c>); sticky header and column need it.</summary>
    [Parameter] public string? MaxHeight { get; set; }

    /// <summary>The table caption, as text.</summary>
    [Parameter] public string? Caption { get; set; }

    /// <summary>The accessible name of the table's scrolling region. Give every table one.</summary>
    [Parameter] public string? Label { get; set; }

    /// <summary>No scroll frame, for a table inside a container that already scrolls.</summary>
    [Parameter] public bool Flow { get; set; }

    /// <summary>Search, filters and buttons above the table (the element's <c>toolbar</c> slot; rendered in a <c>pk-cluster</c>).</summary>
    [Parameter] public RenderFragment? ToolbarContent { get; set; }

    /// <summary>A caption with markup (the <c>caption</c> slot).</summary>
    [Parameter] public RenderFragment? CaptionContent { get; set; }

    /// <summary>Below the table (the <c>footer</c> slot): put a <c>PkPagination</c> here.</summary>
    [Parameter] public RenderFragment? FooterContent { get; set; }
}
