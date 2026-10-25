using System.Collections.Concurrent;
using System.Reflection;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace PlainKit.Blazor;

// #1656, the render-time layer of the extras diagnostic: a component whose element is in an extra the app did not declare never renders without a word.
public abstract partial class PkElementBase
{
    private static readonly ConcurrentDictionary<Type, bool> ExtraReported = new();

    [Inject] private IServiceProvider ExtraServices { get; set; } = default!;

    /// <summary>Development: throws, naming the fix. Elsewhere: one Error per component type (the element stays undefined and the SDK loader names its package).</summary>
    private void CheckExtra()
    {
        if (GetType().GetCustomAttribute<PkRequiresExtraAttribute>() is not { } need || ExtraServices.GetService<PkOptions>() is not { } options || options.Extras.Has(need.Extra)) return;
        var name = need.Extra.ToString().ToLowerInvariant();
        var message = $"{GetType().Name.Split('`')[0]} needs the '{name}' extra, which this app does not declare: add {name} to <PlainKitExtras> in the project file (and to o.Extras when the code chooses extras).";
        if (PkHostEnvironment.IsDevelopment(ExtraServices)) throw new InvalidOperationException(message);
        if (ExtraReported.TryAdd(GetType(), true)) ExtraServices.GetService<ILoggerFactory>()?.CreateLogger(PkLogMapping.Category("blazor")).LogError("{Message}", message);
    }
}
