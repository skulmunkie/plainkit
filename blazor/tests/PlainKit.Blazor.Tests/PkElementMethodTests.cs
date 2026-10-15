using Bunit;
using PlainKit.Blazor;
using PlainKit.Blazor.Components;

namespace PlainKit.Blazor.Tests;

// Issue 1375: the generated XAsync methods forward to the bridge's call(el, method, args); the real dispatcher is covered by the lab case "element-methods".
public sealed class PkElementMethodTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkElementMethodTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public async Task A_method_without_arguments_still_passes_an_empty_argument_array()
    {
        var cut = Render<PkDialog>();

        await cut.Instance.ShowAsync();

        var call = JSInterop.Invocations.Single(i => i.Identifier == "call");
        Assert.Equal(3, call.Arguments.Count);
        Assert.Equal("show", call.Arguments[1]);
        Assert.Empty((object?[])call.Arguments[2]!);
    }

    [Fact]
    public async Task Typed_arguments_are_passed_in_order()
    {
        var cut = Render<PkLightbox>();

        await cut.Instance.ShowAsync(2);

        var call = JSInterop.Invocations.Single(i => i.Identifier == "call");
        Assert.Equal("show", call.Arguments[1]);
        Assert.Equal(new object?[] { 2 }, (object?[])call.Arguments[2]!);
    }

    [Fact]
    public async Task A_return_value_comes_back_typed()
    {
        JSInterop.Setup<bool>("call", _ => true).SetResult(true);
        var cut = Render<PkForm>();

        Assert.True(await cut.Instance.ValidateAllAsync());
    }
}
