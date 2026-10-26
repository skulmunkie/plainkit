using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1812: OnLoadAsync does not start during the static prerender of an interactive page (it was not awaited and outlived the request scope); the interactive render loads once.
public sealed class PrerenderLoadTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PrerenderLoadTests() { JSInterop.Mode = JSRuntimeMode.Loose; Services.AddPlainKit(); Services.AddScoped<IPkStorage>(_ => new NoStorage()); }

    [Fact]
    public void A_page_prerendered_for_an_interactive_mode_does_not_load()
    {
        SetRendererInfo(new RendererInfo("Static", false));
        var loads = 0;
        Render<LoadCountingPage>(p => p.Add(x => x.Loads, () => loads++).SetAssignedRenderMode(RenderMode.InteractiveServer));
        Assert.Equal(0, loads);
    }

    [Fact]
    public void The_same_page_rendered_interactively_loads_once()
    {
        SetRendererInfo(new RendererInfo("Server", true));
        var loads = 0;
        Render<LoadCountingPage>(p => p.Add(x => x.Loads, () => loads++).SetAssignedRenderMode(RenderMode.InteractiveServer));
        Assert.Equal(1, loads);
    }

    [Fact]
    public void A_pure_static_page_with_no_render_mode_still_loads()
    {
        SetRendererInfo(new RendererInfo("Static", false));
        var loads = 0;
        Render<LoadCountingPage>(p => p.Add(x => x.Loads, () => loads++));
        Assert.Equal(1, loads);
    }

    [Fact]
    public void A_component_prerendered_for_an_interactive_mode_does_not_load()
    {
        SetRendererInfo(new RendererInfo("Static", false));
        var loads = 0;
        Render<ComponentBaseHost>(p => p.Add(x => x.Key, 1).Add(x => x.Load, _ => { loads++; return Task.CompletedTask; }).SetAssignedRenderMode(RenderMode.InteractiveServer));
        Assert.Equal(0, loads);
    }

    private sealed class NoStorage : IPkStorage
    {
        public ValueTask<string?> GetAsync(string key) => ValueTask.FromResult<string?>(null);
        public ValueTask SetAsync(string key, string value) => ValueTask.CompletedTask;
        public void Warn(string message) { }
    }
}
