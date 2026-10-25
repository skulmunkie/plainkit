using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #1656, render-time layer: a component of an undeclared extra throws in Development and logs one Error per component type elsewhere; a declared extra renders quietly.
public sealed class PkExtraRenderTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkExtraRenderTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule(PkAssets.Bridge).Mode = JSRuntimeMode.Loose;
    }

    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "app";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class Capture : ILoggerFactory, ILoggerProvider, ILogger
    {
        public readonly List<(LogLevel Level, string Text)> Entries = [];
        public ILogger CreateLogger(string categoryName) => this;
        public void AddProvider(ILoggerProvider provider) { }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => Entries.Add((logLevel, formatter(state, exception)));
        public void Dispose() { }
    }

    [Fact]
    public void in_development_a_component_of_an_undeclared_extra_throws_and_names_the_fix()
    {
        Services.AddPlainKit(o => o.Extras.Add(PkExtra.Dock));
        Services.AddSingleton<IHostEnvironment>(new Env("Development"));
        var e = Assert.Throws<InvalidOperationException>(() => Render<PkMarkdown>());
        Assert.Contains("PkMarkdown", e.Message);
        Assert.Contains("'markdown'", e.Message);
        Assert.Contains("<PlainKitExtras>", e.Message);
    }

    [Fact]
    public void outside_development_it_renders_and_logs_one_error_per_component_type()
    {
        var capture = new Capture();
        Services.AddPlainKit(o => o.Extras.Add(PkExtra.Dock));
        Services.AddSingleton<ILoggerFactory>(capture);
        Render<PkCanvas>();
        Render<PkCanvas>();
        var error = Assert.Single(capture.Entries, x => x.Level == LogLevel.Error && x.Text.Contains("PkCanvas"));
        Assert.Contains("'canvas'", error.Text);
    }

    [Fact]
    public void a_declared_extra_renders_quietly_even_in_development()
    {
        Services.AddPlainKit(o => o.Extras.Add(PkExtra.Markdown));
        Services.AddSingleton<IHostEnvironment>(new Env("Development"));
        var cut = Render<PkMarkdown>();
        Assert.NotNull(cut.Find("pk-markdown"));
    }

    [Fact]
    public void a_core_component_is_never_checked()
    {
        Services.AddPlainKit(o => o.Extras.Add(PkExtra.Dock));
        Services.AddSingleton<IHostEnvironment>(new Env("Development"));
        Assert.NotNull(Render<PkButton>().Find("pk-button"));
    }
}
