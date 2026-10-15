using PlainKit.Blazor;

namespace PlainKit.AppSample.Modules;

// A module is data: its manifest is the JSON the SDK sample's modules describe too (core/samples/app/manifests). Pages are ordinary @page components.
public abstract class SampleModule(string id) : IPkModule
{
    public PkModuleManifest Manifest { get; } = PkModuleManifest.FromJson(Read(id));

    public static string Read(string id)
    {
        using var s = typeof(SampleModule).Assembly.GetManifestResourceStream($"PlainKit.AppSample.Modules.{id}.json")!;
        return new StreamReader(s).ReadToEnd();
    }
}

public sealed class OverviewModule() : SampleModule("overview");
// The data of the widgets the manifests contribute to the Overview dashboard (#1296): what a pk-stat or pk-chart draws, never markup.
public sealed class OrdersModule() : SampleModule("orders"), IPkWidgets
{
    public Task<object?> LoadWidget(string key) => Task.FromResult<object?>(key switch
    {
        "open" => new { value = OrderStore.All.Count(o => o.Status == "Open").ToString(), subtext = "waiting to ship", tone = "neutral" },
        "revenue" => new { kind = "bar", data = new { labels = new[] { "Jul", "Aug", "Sep" }, series = new[] { new { name = "Revenue", values = new[] { 410, 520, 511 } } } } },
        _ => throw new ArgumentException($"no widget \"{key}\"")
    });
}
public sealed class ReportsModule() : SampleModule("reports"), IPkWidgets
{
    public Task<object?> LoadWidget(string key) => key == "exports" ? Task.FromResult<object?>(new { value = "3", subtext = "ready to download" }) : throw new ArgumentException($"no widget \"{key}\"");
}
