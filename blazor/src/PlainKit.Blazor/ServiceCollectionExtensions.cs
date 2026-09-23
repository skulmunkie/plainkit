using Microsoft.Extensions.DependencyInjection;

namespace PlainKit.Blazor;

/// <summary>Registration for PlainKit.Blazor.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Adds <see cref="PkRuntime"/>, <see cref="IPkLog"/>, the options and the dev tools' services. Also put <c>&lt;PkStyles /&gt;</c> in the layout (or link
    /// <see cref="PkAssets.Css"/> yourself). To serve the dev tools page, add this assembly to the router:
    /// <c>AdditionalAssemblies="new[] { typeof(PlainKit.Blazor.PkAssets).Assembly }"</c>.
    /// </summary>
    public static IServiceCollection AddPlainKit(this IServiceCollection services, Action<PkOptions>? configure = null)
    {
        var options = new PkOptions();
        configure?.Invoke(options);
        services.AddSingleton(options);
        services.AddSingleton<PkSourceProvider>();
        services.AddScoped<IPkLog, PkLogWriter>();
        services.AddScoped<PkInteropLog>();
        services.AddSingleton<IPkTimeZoneResolver, PkTimeZoneResolver>();
        if (!OperatingSystem.IsBrowser()) AddCircuitState(services);
        return services.AddScoped<PkRuntime>();
    }

    // Its own method so a browser (WebAssembly) app never loads the server assembly that CircuitHandler lives in.
    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    private static void AddCircuitState(IServiceCollection services)
    {
        services.AddScoped<PkCircuitState>();
        services.AddScoped<Microsoft.AspNetCore.Components.Server.Circuits.CircuitHandler>(sp => new PkCircuitHandler(sp.GetRequiredService<PkCircuitState>()));
    }
}
