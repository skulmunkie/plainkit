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
public sealed class OrdersModule() : SampleModule("orders");
public sealed class ReportsModule() : SampleModule("reports");
