namespace PlainKit.Blazor;

/// <summary>One box of a <c>PkHeatMap</c>: its area is <see cref="Value"/>, its colour is <see cref="Severity"/>.</summary>
/// <remarks>Sent to <c>pk-heat-map</c> inside its <c>items</c> attribute (JSON, camelCase).</remarks>
public sealed record PkHeatItem
{
    /// <summary>Identifies the box in <c>OnSelect</c>.</summary>
    public string Id { get; init; } = "";

    /// <summary>The text of the box.</summary>
    public string Label { get; init; } = "";

    /// <summary>The weight: the box's area is proportional to it. Must be above 0.</summary>
    public double Value { get; init; }

    /// <summary>neutral (the default), info, success, warning or danger.</summary>
    public string Severity { get; init; } = "neutral";

    /// <summary>When set, the box is a link to this address.</summary>
    public string? Href { get; init; }
}
