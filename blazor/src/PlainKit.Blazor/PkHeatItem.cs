namespace PlainKit.Blazor;
/// <summary>One box of a <c>PkHeatMap</c> (sent inside its <c>items</c> attribute as camelCase JSON). The area is <c>Value</c> (above 0, or the sum of <c>Children</c> for a group with <c>GroupBy</c>), the colour is <c>Severity</c> (neutral, info, success, warning, danger) or <c>Intensity</c> (0 to 1, for <c>Scale="Intensity"</c>); <c>Href</c> makes it a link; <c>Id</c> names it in <c>OnSelect</c> and <c>OnFocusItem</c>.</summary>
public sealed record PkHeatItem
{
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
    public double Value { get; init; }
    public string Severity { get; init; } = "neutral";
    public double? Intensity { get; init; }
    public string? Href { get; init; }
    public IReadOnlyList<PkHeatItem>? Children { get; init; }
}
