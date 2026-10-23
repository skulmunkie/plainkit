using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace PlainKit.Blazor;

/// <summary>What the runtime says about the declared extras (#1656): the set once at Information, and in Development a failure when the app declared an extra whose files it does not serve.</summary>
internal static class PkExtraCheck
{
    private static int _logged;

    internal static void Run(PkOptions options, IServiceProvider? services, ILogger? logger)
    {
        var names = options.Extras.Names;
        if (Interlocked.Exchange(ref _logged, 1) == 0) logger?.LogInformation("PlainKit extras: {Extras}", names is null ? "all" : string.Join(", ", names));
        if (names is null || services is null || OperatingSystem.IsBrowser() || !PkHostEnvironment.IsDevelopment(services)) return;
        using var stream = typeof(PkExtraCheck).Assembly.GetManifestResourceStream("plainkit-extras.json")!;
        var table = JsonDocument.Parse(stream).RootElement;
        var missing = names.Where(n => table.TryGetProperty(n, out var e) && e.GetProperty("files").EnumerateArray().Select(f => f.GetString()!).FirstOrDefault(f => !f.EndsWith('/')) is { } probe && Served(services, probe) == false).ToArray();
        if (missing.Length > 0) throw new InvalidOperationException($"The app declares the extra(s) {string.Join(", ", missing)} but the files are not served. Declare them in <PlainKitExtras> in the project file (the build then keeps their files), or remove them from o.Extras.");
    }

    // Own method, never inlined: the server's environment type is not in a browser app.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static bool? Served(IServiceProvider services, string file) =>
        (services.GetService(typeof(Microsoft.AspNetCore.Hosting.IWebHostEnvironment)) as Microsoft.AspNetCore.Hosting.IWebHostEnvironment)?.WebRootFileProvider.GetFileInfo("_content/PlainKit.Blazor/plainkit/" + file).Exists;
}
