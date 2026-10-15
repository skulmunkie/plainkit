using PlainKit.Blazor;

namespace PlainKit.AppSample.Modules;

// The module is known at startup (its manifest builds the nav); its pages are in PlainKit.AppSample.Insights, which PkLazyModuleLoader downloads on the first navigation to /insights.
public sealed class InsightsModule() : SampleModule("insights"), IPkLazyModule
{
    public IReadOnlyList<string> Assemblies { get; } = ["PlainKit.AppSample.Insights.wasm"];
}
