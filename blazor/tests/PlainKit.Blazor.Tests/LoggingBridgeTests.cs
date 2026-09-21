using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

public sealed class LoggingBridgeTests : TestContext
{
    private sealed record Entry(string Category, LogLevel Level, string Text);

    private sealed class Capture : ILoggerProvider, ILogger
    {
        public List<Entry> Entries { get; } = [];
        private string _category = "";
        public ILogger CreateLogger(string categoryName) => new Capture(Entries) { _category = categoryName };
        public Capture() { }
        private Capture(List<Entry> shared) => Entries = shared;
        public void Dispose() { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add(new Entry(_category, logLevel, formatter(state, exception)));
    }

    private static PkLogForwarder Forwarder(Capture capture, Action<PkLoggingOptions>? configure = null)
    {
        var options = new PkLoggingOptions { ForwardToILogger = true };
        configure?.Invoke(options);
        return new PkLogForwarder(LoggerFactory.Create(b => b.SetMinimumLevel(LogLevel.Trace).AddProvider(capture)), options);
    }

    [Theory]
    [InlineData("debug", LogLevel.Debug)]
    [InlineData("info", LogLevel.Information)]
    [InlineData("warn", LogLevel.Warning)]
    [InlineData("error", LogLevel.Error)]
    public void Levels_map_to_LogLevel(string level, LogLevel expected) => Assert.Equal(expected, PkLogMapping.ToLogLevel(level));

    [Theory]
    [InlineData("silent")]
    [InlineData("nonsense")]
    [InlineData(null)]
    public void Other_levels_are_not_forwarded(string? level) => Assert.Null(PkLogMapping.ToLogLevel(level));

    [Fact]
    public void Scope_becomes_the_category()
    {
        var capture = new Capture();
        Forwarder(capture, o => o.ForwardMinimumLevel = PkLogLevel.Debug).Forward("info", "pk-dialog", "opened", null);

        var entry = Assert.Single(capture.Entries);
        Assert.Equal("PlainKit.pk-dialog", entry.Category);
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Equal("opened", entry.Text);
    }

    [Fact]
    public void Detail_is_appended_to_the_message()
    {
        var capture = new Capture();
        Forwarder(capture).Forward("warn", "loader", "bad value", "{\"a\":1}");

        Assert.Equal("bad value {\"a\":1}", Assert.Single(capture.Entries).Text);
    }

    [Fact]
    public void Minimum_level_filters()
    {
        var capture = new Capture();
        var forwarder = Forwarder(capture); // default minimum: warn
        forwarder.Forward("debug", "loader", "a", null);
        forwarder.Forward("info", "loader", "b", null);
        forwarder.Forward("warn", "loader", "c", null);
        forwarder.Forward("error", "loader", "d", null);

        Assert.Equal(["c", "d"], capture.Entries.Select(e => e.Text));
    }

    [Fact]
    public void Scope_filters_include_exclude_and_prefix()
    {
        var capture = new Capture();
        var forwarder = Forwarder(capture, o =>
        {
            o.ForwardScopes.Add("pk-*");
            o.ForwardScopes.Add("loader");
            o.ForwardExcludeScopes.Add("pk-noisy");
        });
        foreach (var scope in new[] { "pk-input", "pk-noisy", "loader", "invokers", "checkout" }) forwarder.Forward("error", scope, "x", null);

        Assert.Equal(["PlainKit.pk-input", "PlainKit.loader"], capture.Entries.Select(e => e.Category));
    }

    [Fact]
    public void Config_only_includes_what_is_set()
    {
        Assert.Null(PkLogMapping.ToConfig(new PkLoggingOptions()));

        var options = new PkLoggingOptions { Level = PkLogLevel.Info };
        options.Scopes["loader"] = PkLogLevel.Debug;
        options.Routes[PkLogLevel.Error] = ["console", "toast"];
        var config = PkLogMapping.ToConfig(options)!;

        Assert.Equal("info", config["level"]);
        Assert.Equal("debug", ((Dictionary<string, string>)config["scopes"])["loader"]);
        Assert.Equal(["console", "toast"], ((Dictionary<string, string[]>)config["routes"])["error"]);
    }

    private (PkRuntime Runtime, BunitJSModuleInterop Bridge) Runtime(Action<PkOptions>? configure = null)
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var options = new PkOptions();
        configure?.Invoke(options);
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        return (new PkRuntime(JSInterop.JSRuntime, options, LoggerFactory.Create(b => b.AddProvider(new Capture()))), bridge);
    }

    [Fact]
    public async Task Startup_applies_configuration_and_starts_the_forwarder_once()
    {
        var (runtime, bridge) = Runtime(o => { o.Logging.Level = PkLogLevel.Info; o.Logging.ForwardToILogger = true; });

        await runtime.EnsureInitializedAsync();
        await runtime.EnsureLoggingAsync();

        Assert.Single(bridge.Invocations["configureLogging"]);
        var start = Assert.Single(bridge.Invocations["startLogForwarding"]);
        Assert.Equal("warn", start.Arguments[1]);
    }

    [Fact]
    public async Task Forwarder_is_off_by_default()
    {
        var (runtime, bridge) = Runtime();

        await runtime.EnsureInitializedAsync();

        Assert.DoesNotContain("startLogForwarding", bridge.Invocations.Select(i => i.Identifier));
        Assert.DoesNotContain("configureLogging", bridge.Invocations.Select(i => i.Identifier));
    }

    [Fact]
    public async Task Dispose_stops_the_forwarder()
    {
        var (runtime, bridge) = Runtime(o => o.Logging.ForwardToILogger = true);
        await runtime.EnsureInitializedAsync();

        await runtime.DisposeAsync();

        Assert.Single(bridge.Invocations["stopLogForwarding"]);
    }

    [Fact]
    public async Task IPkLog_writes_into_the_sdk_log_and_configures_it()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        var log = Services.GetRequiredService<IPkLog>();

        await log.WriteAsync(PkLogLevel.Warn, "checkout", "declined", "order 7");
        await log.WriteAsync(PkLogLevel.Silent, "checkout", "never", null);
        await log.SetLevelAsync(PkLogLevel.Debug);

        var write = Assert.Single(bridge.Invocations["writeLog"]);
        Assert.Equal(new object?[] { "warn", "checkout", "declined", "order 7" }, write.Arguments);
        Assert.Single(bridge.Invocations["configureLogging"]);
    }
}
