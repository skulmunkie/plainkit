using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Callbacks the generator makes from a mapping's "events" list: every listed element event reaches its EventCallback with the typed detail.
public sealed class PkGeneratedCallbackTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkGeneratedCallbackTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task PropertyGrid_OnPropertyChange_receives_the_detail_of_pk_property_change()
    {
        PkPropertyChangeEventArgs? got = null;
        var cut = Render<PkPropertyGrid>(p => p.Add(x => x.OnPropertyChange, e => got = e));

        await cut.Find("pk-property-grid").TriggerEventAsync("onpk-property-change", new PkPropertyChangeEventArgs { Key = "radius" });

        Assert.NotNull(got);
        Assert.Equal("radius", got!.Key);
    }

    [Fact]
    public async Task Button_OnToggle_receives_the_detail_of_pk_toggle()
    {
        PkToggleEventArgs? got = null;
        var cut = Render<PkButton>(p => p.Add(x => x.OnToggle, e => got = e));

        await cut.Find("pk-button").TriggerEventAsync("onpk-toggle", new PkToggleEventArgs { Pressed = true, Value = "bold" });

        Assert.NotNull(got);
        Assert.True(got!.Pressed);
        Assert.Equal("bold", got.Value);
    }
}
