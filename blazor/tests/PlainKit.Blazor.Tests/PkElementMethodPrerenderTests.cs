using Bunit;
using Microsoft.AspNetCore.Components;
using PlainKit.Blazor;
using PlainKit.Blazor.Components;

namespace PlainKit.Blazor.Tests;

// Issue 1778: an element method called during the static prerender (a list page reloaded from OnParametersSetAsync) is a no-op, not the interop exception.
public sealed class PkElementMethodPrerenderTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private void StaticInterop()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        bridge.SetupVoid("call", _ => true).SetException(new InvalidOperationException("JavaScript interop calls cannot be issued at this time. This is because the component is being statically rendered."));
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_method_called_while_statically_rendered_does_nothing()
    {
        StaticInterop();
        SetRendererInfo(new RendererInfo("Static", false));
        var cut = Render<PkDialog>();
        await cut.InvokeAsync(() => cut.Instance.ShowAsync());
    }

    [Fact]
    public async Task The_same_failure_in_an_interactive_render_still_throws()
    {
        StaticInterop();
        SetRendererInfo(new RendererInfo("Server", true));
        var cut = Render<PkDialog>();
        await Assert.ThrowsAsync<InvalidOperationException>(() => cut.InvokeAsync(() => cut.Instance.ShowAsync()));
    }
}
