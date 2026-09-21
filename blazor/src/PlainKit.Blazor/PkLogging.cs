using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>The levels of the SDK logger, lowest first. <see cref="Silent"/> emits nothing.</summary>
public enum PkLogLevel { Debug, Info, Warn, Error, Silent }

/// <summary>Logging settings for the SDK logger (<c>js/log.js</c>) and the bridge that forwards its entries to <see cref="ILogger"/>. Set on <see cref="PkOptions.Logging"/>.</summary>
public sealed class PkLoggingOptions
{
    /// <summary>The SDK's global level, applied at startup with <c>configureLogging</c>. Null leaves what the page decided (default <c>warn</c>, or the URL, page attribute or saved settings).</summary>
    public PkLogLevel? Level { get; set; }

    /// <summary>A level per scope (<c>loader</c>, <c>pk-dialog</c>, ...), which wins over <see cref="Level"/> for that scope.</summary>
    public IDictionary<string, PkLogLevel> Scopes { get; } = new Dictionary<string, PkLogLevel>();

    /// <summary>Where each level is sent: the output names <c>console</c>, <c>toast</c>, <c>alert</c> or one an app registered. A level not listed keeps its routing.</summary>
    public IDictionary<PkLogLevel, IList<string>> Routes { get; } = new Dictionary<PkLogLevel, IList<string>>();

    /// <summary>Whether SDK entries are also written to <see cref="ILogger"/> (category <c>PlainKit.&lt;scope&gt;</c>). Off by default.</summary>
    public bool ForwardToILogger { get; set; }

    /// <summary>The lowest SDK level that is forwarded (default <see cref="PkLogLevel.Warn"/>). The SDK sends every entry to its sinks whatever its level, so this is the forwarder's own filter, independent of <see cref="Level"/>.</summary>
    public PkLogLevel ForwardMinimumLevel { get; set; } = PkLogLevel.Warn;

    /// <summary>The scopes that are forwarded. Empty means all. An entry ending in <c>*</c> matches a prefix (<c>pk-*</c>).</summary>
    public IList<string> ForwardScopes { get; } = new List<string>();

    /// <summary>Scopes that are never forwarded; same matching as <see cref="ForwardScopes"/>, and it wins over it.</summary>
    public IList<string> ForwardExcludeScopes { get; } = new List<string>();
}

internal static class PkLogMapping
{
    internal static string Name(PkLogLevel level) => level.ToString().ToLowerInvariant();

    internal static int Rank(string? level) => level switch { "debug" => 0, "info" => 1, "warn" => 2, "error" => 3, "silent" => 4, _ => -1 };

    /// <summary>debug is Debug, info Information, warn Warning, error Error; anything else (including silent) is null and is not forwarded.</summary>
    internal static LogLevel? ToLogLevel(string? level) => level switch
    {
        "debug" => LogLevel.Debug,
        "info" => LogLevel.Information,
        "warn" => LogLevel.Warning,
        "error" => LogLevel.Error,
        _ => null,
    };

    internal static string Category(string? scope) => string.IsNullOrWhiteSpace(scope) ? "PlainKit" : "PlainKit." + scope;

    internal static bool ScopeMatches(string scope, string pattern) =>
        pattern.EndsWith('*') ? scope.StartsWith(pattern[..^1], StringComparison.Ordinal) : string.Equals(scope, pattern, StringComparison.Ordinal);

    internal static bool ScopeAllowed(string scope, IEnumerable<string> include, IEnumerable<string> exclude)
    {
        if (exclude.Any(p => ScopeMatches(scope, p))) return false;
        var list = include.ToList();
        return list.Count == 0 || list.Any(p => ScopeMatches(scope, p));
    }

    /// <summary>The settings object <c>configureLogging</c> takes, or null when nothing is set.</summary>
    internal static Dictionary<string, object>? ToConfig(PkLoggingOptions o)
    {
        var config = new Dictionary<string, object>();
        if (o.Level is { } level) config["level"] = Name(level);
        if (o.Scopes.Count > 0) config["scopes"] = o.Scopes.ToDictionary(kv => kv.Key, kv => Name(kv.Value));
        if (o.Routes.Count > 0) config["routes"] = o.Routes.ToDictionary(kv => Name(kv.Key), kv => kv.Value.ToArray());
        return config.Count == 0 ? null : config;
    }
}

/// <summary>Receives the SDK's log entries from the JavaScript sink and writes them to <see cref="ILogger"/>. Entries that .NET wrote into the SDK through <see cref="IPkLog"/> never arrive here (the bridge skips them).</summary>
internal sealed class PkLogForwarder(ILoggerFactory factory, PkLoggingOptions options)
{
    internal int Forwarded { get; private set; }

    [JSInvokable]
    public void Forward(string level, string scope, string message, string? detail)
    {
        if (PkLogMapping.ToLogLevel(level) is not { } logLevel) return;
        if (PkLogMapping.Rank(level) < (int)options.ForwardMinimumLevel) return;
        if (!PkLogMapping.ScopeAllowed(scope ?? "", options.ForwardScopes, options.ForwardExcludeScopes)) return;
        var logger = factory.CreateLogger(PkLogMapping.Category(scope));
        if (!logger.IsEnabled(logLevel)) return;
        Forwarded++;
        if (string.IsNullOrEmpty(detail)) logger.Log(logLevel, "{PkMessage}", message);
        else logger.Log(logLevel, "{PkMessage} {PkDetail}", message, detail);
    }
}

/// <summary>Lets Blazor code write into the SDK log (its buffer, outputs and sinks, so the logs viewer shows it beside the SDK's own entries) and change the SDK's logging settings. Entries written here are not echoed back to <see cref="ILogger"/>. Calls never throw when the circuit or JavaScript is not available (prerendering, disconnected).</summary>
public interface IPkLog
{
    /// <summary>Writes an entry. <paramref name="scope"/> names the speaker (an app's own scope, e.g. <c>checkout</c>); <see cref="PkLogLevel.Silent"/> writes nothing.</summary>
    ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null);

    /// <summary>Sets the SDK's global log level.</summary>
    ValueTask SetLevelAsync(PkLogLevel level);

    /// <summary>Merges settings into the SDK's logging configuration (level, per-scope levels, routes). The forwarding settings are read only at startup.</summary>
    ValueTask ConfigureAsync(PkLoggingOptions settings);
}

internal sealed class PkLog(PkRuntime runtime) : IPkLog
{
    public async ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null)
    {
        if (level == PkLogLevel.Silent) return;
        await Safe(b => b.InvokeVoidAsync("writeLog", PkLogMapping.Name(level), scope, message, detail));
    }

    public ValueTask SetLevelAsync(PkLogLevel level) => ConfigureAsync(new PkLoggingOptions { Level = level });

    public async ValueTask ConfigureAsync(PkLoggingOptions settings)
    {
        if (PkLogMapping.ToConfig(settings) is { } config) await Safe(b => b.InvokeVoidAsync("configureLogging", config));
    }

    private async ValueTask Safe(Func<IJSObjectReference, ValueTask> call)
    {
        try
        {
            await runtime.EnsureLoggingAsync();
            await call(await runtime.BridgeAsync());
        }
        catch (Exception e) when (e is JSDisconnectedException or InvalidOperationException or OperationCanceledException or ObjectDisposedException)
        {
            // no circuit or no JavaScript yet (prerendering, disconnected): a log call must not break the caller
        }
    }
}
