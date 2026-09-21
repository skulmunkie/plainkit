using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

public sealed class LogComponentTests : TestContext
{
    public LogComponentTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit(o => o.DevTools = true);
    }

    [Fact]
    public void Logs_renders_its_host_element()
    {
        var cut = RenderComponent<PkLogs>(p => p.Add(x => x.Level, "warn").Add(x => x.Height, "20rem"));

        Assert.Single(cut.FindAll("div"));
    }

    [Fact]
    public void Log_settings_renders_its_host_element()
    {
        var cut = RenderComponent<PkLogSettings>(p => p.Add(x => x.Theme, PkTheme.Dark));

        Assert.Single(cut.FindAll("div"));
    }
}
