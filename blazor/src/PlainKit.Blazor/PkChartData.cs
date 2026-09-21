namespace PlainKit.Blazor;

/// <summary>The data of a <c>PkChart</c> given as a value instead of a slotted table: category labels and one or more named series.</summary>
/// <remarks>Sent to <c>pk-chart</c> as its <c>data</c> attribute (JSON, camelCase): <c>{ "labels": [...], "series": [{ "name": ..., "values": [...] }] }</c>.</remarks>
public sealed record PkChartData
{
    /// <summary>The category labels, one per value of each series.</summary>
    public IReadOnlyList<string> Labels { get; init; } = [];

    /// <summary>The series to draw. A bar, line or stack chart draws all of them; a donut or spark chart uses the first.</summary>
    public IReadOnlyList<PkChartSeries> Series { get; init; } = [];
}

/// <summary>One named series of numbers in a <see cref="PkChartData"/>.</summary>
public sealed record PkChartSeries
{
    /// <summary>The name of the series (its legend entry).</summary>
    public string Name { get; init; } = "";

    /// <summary>The numbers, in the order of <see cref="PkChartData.Labels"/>.</summary>
    public IReadOnlyList<double> Values { get; init; } = [];
}
