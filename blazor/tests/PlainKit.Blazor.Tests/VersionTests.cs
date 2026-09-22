using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

/// <summary>The SDK and PlainKit.Blazor share one version (core/VERSION); every place it is stamped must agree.</summary>
public sealed class VersionTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private sealed record Entry(string Category, LogLevel Level, string Text);

    private sealed class Capture(List<Entry> entries, string category = "") : ILoggerProvider, ILogger
    {
        public ILogger CreateLogger(string categoryName) => new Capture(entries, categoryName);
        public void Dispose() { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            entries.Add(new Entry(category, logLevel, formatter(state, exception)));
    }

    // A runtime whose JavaScript reports sdkVersion (null: a bridge that does not answer, as a loose mock does), plus what it logged.
    private (PkRuntime Runtime, BunitJSModuleInterop Bridge, List<Entry> Logged) RuntimeWith(string? sdkVersion)
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        if (sdkVersion is not null) bridge.Setup<string>("version").SetResult(sdkVersion);
        var logged = new List<Entry>();
        return (new PkRuntime(JSInterop.JSRuntime, new PkOptions(), LoggerFactory.Create(b => b.SetMinimumLevel(LogLevel.Trace).AddProvider(new Capture(logged)))), bridge, logged);
    }

    private static string RepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "core", "VERSION"))) return dir.FullName;
        throw new InvalidOperationException("core/VERSION not found above the test output folder");
    }

    private static string CoreVersion() => File.ReadAllText(Path.Combine(RepoRoot(), "core", "VERSION")).Trim();

    [Fact]
    public void The_package_version_is_core_VERSION()
    {
        Assert.Equal(CoreVersion(), PkAssets.Version);
    }

    [Fact]
    public void The_copy_of_dist_the_package_serves_is_stamped_with_the_same_version()
    {
        var stamp = File.ReadAllText(Path.Combine(RepoRoot(), "blazor", "src", "PlainKit.Blazor", "wwwroot", "plainkit", "js", "version.js"));
        Assert.Contains($"PK_VERSION = '{CoreVersion()}'", stamp);
    }

    [Fact]
    public async Task The_runtime_reports_the_version_of_the_javascript_it_loaded()
    {
        Services.AddPlainKit();
        var module = JSInterop.SetupModule("./_content/PlainKit.Blazor/plainkit.blazor.js");
        module.Setup<string>("version").SetResult("9.9.9");

        Assert.Equal("9.9.9", await Services.GetRequiredService<PkRuntime>().GetSdkVersionAsync());
    }

    [Fact]
    public async Task A_javascript_version_that_differs_from_the_package_logs_one_warning_per_runtime()
    {
        var (runtime, bridge, logged) = RuntimeWith("9.9.9");

        await runtime.EnsureInitializedAsync();
        await runtime.EnsureInitializedAsync();

        var warning = Assert.Single(logged, e => e.Level == LogLevel.Warning);
        Assert.Equal("PlainKit.blazor", warning.Category);
        Assert.Contains(PkAssets.Version, warning.Text);
        Assert.Contains("9.9.9", warning.Text);
        var write = Assert.Single(bridge.Invocations["writeLog"]);
        Assert.Equal("warn", write.Arguments[0]);
        Assert.Equal("blazor", write.Arguments[1]);
        Assert.Equal(warning.Text, write.Arguments[2]);
        Assert.Single(bridge.Invocations["init"]);
    }

    [Fact]
    public async Task The_same_version_and_an_unanswered_version_log_nothing()
    {
        foreach (var sdk in new[] { PkAssets.Version, null })
        {
            var (runtime, bridge, logged) = RuntimeWith(sdk);

            await runtime.EnsureInitializedAsync();

            Assert.DoesNotContain(logged, e => e.Level >= LogLevel.Warning);
            Assert.DoesNotContain("writeLog", bridge.Invocations.Select(i => i.Identifier));
            Assert.Single(bridge.Invocations["init"]);
        }
    }

    [Fact]
    public async Task A_failing_version_check_never_breaks_startup()
    {
        var (runtime, bridge, logged) = RuntimeWith(null);
        bridge.Setup<string>("version").SetException(new InvalidOperationException("JavaScript interop calls cannot be issued at this time."));

        await runtime.EnsureInitializedAsync();

        Assert.Single(bridge.Invocations["init"]);
        Assert.DoesNotContain(logged, e => e.Level >= LogLevel.Warning);
        Assert.Contains(logged, e => e.Level == LogLevel.Debug && e.Text.Contains("Could not compare"));
    }
}
