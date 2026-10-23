namespace PlainKit.Blazor;

/// <summary>One box of a <c>PkHeatMap</c> (sent inside its <c>items</c> attribute as camelCase JSON): its area is <see cref="Value"/>, its colour is <see cref="Severity"/> or <see cref="Intensity"/>.</summary>
public sealed record PkHeatItem
{
    /// <summary>Identifies the box in <c>OnSelect</c> and <c>OnFocusItem</c>.</summary>
    public string Id { get; init; } = "";
    /// <summary>The text of the box.</summary>
    public string Label { get; init; } = "";
    /// <summary>The weight: the box's area is proportional to it. Must be above 0.</summary>
    public double Value { get; init; }
    /// <summary>neutral (the default), info, success, warning or danger (the status scale).</summary>
    public string Severity { get; init; } = "neutral";
    /// <summary>0 to 1, for <c>Scale="Intensity"</c>.</summary>
    public double? Intensity { get; init; }
    /// <summary>When set, the box is a link to this address.</summary>
    public string? Href { get; init; }
}
