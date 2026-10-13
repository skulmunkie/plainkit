using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;

namespace PlainKit.Blazor;

/// <summary>A module of the app (#364): its data is the manifest. Pages stay ordinary <c>@page</c> components.</summary>
public interface IPkModule
{
    /// <summary>The module's id, title, nav and routes.</summary>
    PkModuleManifest Manifest { get; }
}

/// <summary>The ordered allow-list of modules (the order is the picker order) and the app settings, registered by <see cref="PkAppModules.AddPlainKitApp"/>.</summary>
public sealed class PkModuleCatalog
{
    internal PkModuleCatalog(string brand, string? home, string? footer, IReadOnlyList<IPkModule> modules) { Brand = brand; Home = home; Footer = footer; Modules = modules; }

    public string Brand { get; }
    public string? Home { get; }
    public string? Footer { get; }
    public IReadOnlyList<IPkModule> Modules { get; }

    /// <summary>The module with this id, or null.</summary>
    public IPkModule? Get(string id) => Modules.FirstOrDefault(m => m.Manifest.Id == id);
}

/// <summary>Collects the app's modules in <c>AddPlainKitApp</c>.</summary>
public sealed class PkAppBuilder
{
    internal string BrandText = "App";
    internal string? HomeId, FooterText;
    internal readonly List<IPkModule> Modules = [];

    public PkAppBuilder Brand(string text) { BrandText = text; return this; }
    public PkAppBuilder Home(string moduleId) { HomeId = moduleId; return this; }
    public PkAppBuilder Footer(string text) { FooterText = text; return this; }

    /// <summary>Adds a module. A bad or duplicate id throws here (a code mistake, like the SDK's <c>MODULE_ID</c> check).</summary>
    public PkAppBuilder Module<T>() where T : IPkModule, new()
    {
        var m = new T();
        var id = m.Manifest.Id;
        if (!Regex.IsMatch(id, "^[a-z][a-z0-9-]{0,39}$")) throw new ArgumentException($"module id \"{id}\" must match ^[a-z][a-z0-9-]{{0,39}}$");
        if (Modules.Any(x => x.Manifest.Id == id)) throw new ArgumentException($"duplicate module id \"{id}\"");
        Modules.Add(m);
        return this;
    }
}

public static class PkAppModules
{
    /// <summary>Registers the module catalog (a singleton).</summary>
    public static IServiceCollection AddPlainKitApp(this IServiceCollection services, Action<PkAppBuilder> configure)
    {
        var b = new PkAppBuilder();
        configure(b);
        if (b.HomeId is not null && !b.Modules.Any(m => m.Manifest.Id == b.HomeId)) throw new ArgumentException($"Home(\"{b.HomeId}\") is not a registered module");
        return services.AddSingleton(new PkModuleCatalog(b.BrandText, b.HomeId, b.FooterText, b.Modules));
    }
}
