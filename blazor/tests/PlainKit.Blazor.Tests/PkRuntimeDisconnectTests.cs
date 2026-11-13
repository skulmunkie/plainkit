using Bunit;
using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1972: a circuit that goes away while the first-render init call is in flight is not an error; other JS failures still surface.
public sealed class PkRuntimeDisconnectTests : BunitContext
{
    private PkRuntime Runtime(Exception failure)
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var bridge = JSInterop.SetupModule(PkAssets.Bridge);
        bridge.Mode = JSRuntimeMode.Loose;
        bridge.SetupVoid("init", _ => true).SetException(failure);
        return new PkRuntime(JSInterop.JSRuntime, new PkOptions(), LoggerFactory.Create(b => { }));
    }

    [Fact]
    public async Task A_disconnected_circuit_during_init_does_not_escape() =>
        await Runtime(new JSDisconnectedException("circuit gone")).EnsureInitializedAsync();

    [Fact]
    public async Task A_cancelled_init_call_does_not_escape() =>
        await Runtime(new TaskCanceledException()).EnsureInitializedAsync();

    [Fact]
    public async Task Another_JSException_during_init_still_surfaces()
    {
        var e = await Assert.ThrowsAsync<JSException>(() => Runtime(new JSException("boom")).EnsureInitializedAsync());
        Assert.Equal("boom", e.Message);
    }
}
