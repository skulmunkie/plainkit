using System.Runtime.CompilerServices;

namespace PlainKit.Blazor;

/// <summary>
/// What the host says about itself, without a hard dependency on either host's assembly: the server's <c>IHostEnvironment</c> lives in
/// Microsoft.Extensions.Hosting.Abstractions, which a Blazor WebAssembly app does not ship (a constructor or method that mentions it fails to load there),
/// and WebAssembly's <c>IWebAssemblyHostEnvironment</c> is in the WebAssembly assembly, which the server does not have.
/// </summary>
internal static class PkHostEnvironment
{
    /// <summary>The server's content root, or null in a browser app (which has no server-side files) or when the host has none.</summary>
    internal static string? ContentRoot(IServiceProvider? services) => OperatingSystem.IsBrowser() ? null : ServerContentRoot(services);

    /// <summary>True when the host runs in the Development environment (a browser app: false when its environment cannot be read; set <see cref="PkOptions.DevTools"/> then).</summary>
    internal static bool IsDevelopment(IServiceProvider services) => OperatingSystem.IsBrowser() ? BrowserIsDevelopment(services) : ServerIsDevelopment(services);

    // Own methods, never inlined, so the browser never loads the type they mention.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static string? ServerContentRoot(IServiceProvider? services) =>
        (services?.GetService(typeof(Microsoft.Extensions.Hosting.IHostEnvironment)) as Microsoft.Extensions.Hosting.IHostEnvironment)?.ContentRootPath;

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static bool ServerIsDevelopment(IServiceProvider services) =>
        services.GetService(typeof(Microsoft.Extensions.Hosting.IHostEnvironment)) is Microsoft.Extensions.Hosting.IHostEnvironment { EnvironmentName: "Development" };

    // IWebAssemblyHostEnvironment.Environment, found by name: this assembly must not reference the WebAssembly assembly (the server has none).
    private static bool BrowserIsDevelopment(IServiceProvider services)
    {
        var type = Type.GetType("Microsoft.AspNetCore.Components.WebAssembly.Hosting.IWebAssemblyHostEnvironment, Microsoft.AspNetCore.Components.WebAssembly");
        var environment = type is null ? null : services.GetService(type);
        var name = type?.GetProperty("Environment")?.GetValue(environment) as string;
        return name == "Development";
    }
}
