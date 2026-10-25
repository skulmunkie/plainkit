using System.Text.Json;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #1714 phase 2: PkReconnect renders the element the Blazor client drives, with its options as one data attribute, a module script and no inline script or style.
public sealed class PkReconnectTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkReconnectTests() => JSInterop.Mode = JSRuntimeMode.Loose;

    private static JsonElement Config(IRenderedComponent<PkReconnect> cut) => JsonDocument.Parse(cut.Find("#components-reconnect-modal").GetAttribute("data-pk-reconnect")!).RootElement;

    [Fact]
    public void Renders_the_framework_element_with_the_default_policy()
    {
        Services.AddPlainKit();
        var cut = Render<PkReconnect>();
        var modal = cut.Find("div#components-reconnect-modal");
        Assert.Empty(modal.Children);
        var cfg = Config(cut);
        Assert.Equal("gone", cfg.GetProperty("autoReload").GetString());
        Assert.Equal(5, cfg.GetProperty("countdown").GetInt32());
        Assert.Equal("/", cfg.GetProperty("probeUrl").GetString());
        Assert.Empty(cfg.GetProperty("strings").EnumerateObject());
        Assert.False(cfg.GetProperty("modal").GetBoolean());
        Assert.False(cfg.GetProperty("overlay").GetBoolean());
    }

    // Issue 1774: Overlay reaches the banner's options.
    [Fact]
    public void Overlay_is_sent_to_the_banner()
    {
        Services.AddPlainKit();
        var cut = Render<PkReconnect>(p => p.Add(x => x.Reconnect, new PkReconnectOptions { Overlay = true }));
        Assert.True(Config(cut).GetProperty("overlay").GetBoolean());
    }

    [Fact]
    public void Takes_its_options_from_the_parameter_over_PkOptions()
    {
        Services.AddPlainKit(o => o.Reconnect = new() { AutoReload = PkReconnectAutoReload.Never });
        var cut = Render<PkReconnect>(p => p.Add(x => x.Reconnect, new PkReconnectOptions { AutoReload = PkReconnectAutoReload.Always, Modal = true, CountdownSeconds = 8, Strings = { Ended = "Sitzung beendet" } }));
        var cfg = Config(cut);
        Assert.True(cfg.GetProperty("modal").GetBoolean());
        Assert.Equal("always", cfg.GetProperty("autoReload").GetString());
        Assert.Equal(8, cfg.GetProperty("countdown").GetInt32());
        Assert.Equal("Sitzung beendet", cfg.GetProperty("strings").GetProperty("ended").GetString());
        Assert.False(cfg.GetProperty("strings").TryGetProperty("busy", out _));
    }

    [Fact]
    public void Falls_back_to_PkOptions_Reconnect()
    {
        Services.AddPlainKit(o => o.Reconnect = new() { AutoReload = PkReconnectAutoReload.Never, Modal = true });
        var cut = Render<PkReconnect>();
        Assert.Equal("never", Config(cut).GetProperty("autoReload").GetString());
        Assert.True(Config(cut).GetProperty("modal").GetBoolean());
    }

    [Fact]
    public void Writes_a_module_script_and_nothing_inline()
    {
        Services.AddPlainKit();
        var cut = Render<PkReconnect>();
        var script = cut.Find("script");
        Assert.Equal("module", script.GetAttribute("type"));
        Assert.EndsWith("plainkit.reconnect.js", script.GetAttribute("src"));
        Assert.Empty(script.TextContent);
        Assert.Empty(cut.FindAll("[style]"));
        Assert.Empty(cut.FindAll("style"));
        Assert.DoesNotContain(cut.FindAll("*").SelectMany(e => e.Attributes), a => a.Name.StartsWith("on", StringComparison.Ordinal));
    }

    [Fact]
    public async Task PkApp_starts_it_through_the_bridge_only_when_PkOptions_Reconnect_is_set()
    {
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Brand("Demo"));
        var bridge = JSInterop.SetupModule(m => true);
        bridge.SetupVoid("startReconnect", _ => true);
        Render<PkApp>();
        Assert.DoesNotContain(bridge.Invocations, i => i.Identifier == "startReconnect");

        await using var other = new BunitContext();
        other.JSInterop.Mode = JSRuntimeMode.Loose;
        other.Services.AddPlainKit(o => o.Reconnect = new() { Modal = true });
        other.Services.AddPlainKitApp(a => a.Brand("Demo"));
        var started = other.JSInterop.SetupModule(m => true);
        started.SetupVoid("startReconnect", _ => true);
        other.Render<PkApp>();
        var call = Assert.Single(started.Invocations, i => i.Identifier == "startReconnect");
        Assert.True(JsonDocument.Parse((string)call.Arguments[0]!).RootElement.GetProperty("modal").GetBoolean());
    }
}
