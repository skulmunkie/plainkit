using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 592: PkDock's controlled mode. ConfirmLayout is the element's confirmLayout callback property (business logic, not config, set from
// script the same way pk-tool-page's run is): unset, the component behaves exactly as PR #540 shipped it (Layout bindable, no callback wired);
// set, the component hands the element a .NET reference (PkCallbackSlot) that the element awaits before applying a proposed change.
public sealed class PkDockTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkDockTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    [Fact]
    public void sends_layout_and_the_other_props_and_sets_no_callback_without_ConfirmLayout()
    {
        var cut = Render<PkDock>(p => p.Add(x => x.Layout, "{\"version\":1,\"seq\":1,\"root\":null}").Add(x => x.Label, "Editor").Add(x => x.Fill, true));

        var el = cut.Find("pk-dock");
        Assert.Equal("{\"version\":1,\"seq\":1,\"root\":null}", el.GetAttribute("layout"));
        Assert.Equal("Editor", el.GetAttribute("label"));
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task ConfirmLayout_reaches_the_delegate_with_the_proposed_layout_and_reason_and_returns_its_result()
    {
        string? seenLayout = null, seenReason = null;
        var cut = Render<PkDock>(p => p.Add(x => x.ConfirmLayout, (layout, reason) =>
        {
            seenLayout = layout; seenReason = reason;
            return Task.FromResult<string?>("{\"version\":1,\"seq\":2,\"root\":null}");
        }));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
        Assert.Equal("confirmLayout", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkLayoutChangingRequest>>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(new PkLayoutChangingRequest("{\"version\":1,\"seq\":1,\"root\":null}", "resize")));

        Assert.Equal("{\"version\":1,\"seq\":1,\"root\":null}", seenLayout);
        Assert.Equal("resize", seenReason);
        Assert.Equal("{\"version\":1,\"seq\":2,\"root\":null}", result);
    }

    [Fact]
    public async Task ConfirmLayout_that_throws_faults_the_call_so_the_element_keeps_the_previous_layout()
    {
        var cut = Render<PkDock>(p => p.Add(x => x.ConfirmLayout, (_, _) => throw new InvalidOperationException("rejected")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkLayoutChangingRequest>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => cut.InvokeAsync(() => host.Value.Invoke(new PkLayoutChangingRequest("{}", "resize"))));
        Assert.Equal("rejected", e.Message);
    }

    [Fact]
    public async Task ConfirmLayout_returning_null_tells_the_element_to_keep_the_previous_layout()
    {
        var cut = Render<PkDock>(p => p.Add(x => x.ConfirmLayout, (_, _) => Task.FromResult<string?>(null)));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkLayoutChangingRequest>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var result = await cut.InvokeAsync(() => host.Value.Invoke(new PkLayoutChangingRequest("{\"version\":1,\"seq\":9,\"root\":null}", "activate")));
        Assert.Null(result);
    }

    [Fact]
    public async Task clears_the_callback_when_ConfirmLayout_is_removed_and_releases_the_reference_on_dispose()
    {
        var cut = Render<PkDock>(p => p.Add(x => x.ConfirmLayout, (l, _) => Task.FromResult<string?>(l)));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkLayoutChangingRequest>>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        cut.Render(p => p.Add<Func<string, string, Task<string?>>?>(x => x.ConfirmLayout, null));
        Assert.Equal(2, _bridge.Invocations["setCallback"].Count);
        Assert.Null(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        Assert.Throws<ObjectDisposedException>(() => host.Value);

        cut.Render(p => p.Add(x => x.ConfirmLayout, (l, _) => Task.FromResult<string?>(l)));
        var again = Assert.IsType<DotNetObjectReference<PkCallbackHost<PkLayoutChangingRequest>>>(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => again.Value);
    }

    [Fact]
    public async Task pk_layout_change_still_updates_Layout_and_raises_OnLayoutChange_the_same_way_whether_or_not_ConfirmLayout_is_set()
    {
        string? bound = null;
        PkLayoutChangeEventArgs? raised = null;
        var cut = Render<PkDock>(p => p
            .Add(x => x.LayoutChanged, v => bound = v)
            .Add(x => x.OnLayoutChange, e => raised = e));

        var el = cut.Find("pk-dock");
        await cut.InvokeAsync(() => el.TriggerEventAsync("onpk-layout-change", new PkLayoutChangeEventArgs { Reason = "resize" }));

        Assert.Equal("resize", raised!.Reason);
        Assert.Equal(raised.Layout?.ToString(), bound);
    }
}
