using System.Text.Json;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 366: PkToolPage.Run and PkSettingsPage.Save are the elements' run/save callback properties. The component hands the element a .NET
// reference through the bridge (setCallback); calling it runs the delegate with the element's values.
public sealed class PkPageCallbackTests : BunitContext, IAsyncLifetime
{
    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly BunitJSModuleInterop _bridge;

    public PkPageCallbackTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        _bridge = JSInterop.SetupModule(PkAssets.Bridge);
        _bridge.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
    }

    private static Dictionary<string, JsonElement> Values(string json) => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void ToolPage_sends_config_and_label_and_sets_no_callback_without_Run()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Config, "{\"outcome\":\"text\"}").Add(x => x.RunLabel, "Count"));

        var el = cut.Find("pk-tool-page");
        Assert.Equal("{\"outcome\":\"text\"}", el.GetAttribute("config"));
        Assert.Equal("Count", el.GetAttribute("run-label"));
        Assert.DoesNotContain(_bridge.Invocations, i => i.Identifier == "setCallback");
    }

    [Fact]
    public async Task ToolPage_run_reaches_the_delegate_with_the_field_values_and_returns_its_result()
    {
        IReadOnlyDictionary<string, JsonElement>? seen = null;
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, v => { seen = v; return Task.FromResult<object?>(new { value = 3, label = "Words" }); }));

        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.IsType<ElementReference>(call.Arguments[0]);
        Assert.Equal("run", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"text\":\"a b c\",\"n\":2}")));

        Assert.Equal("a b c", seen!["text"].GetString());
        Assert.Equal(2, seen["n"].GetInt32());
        Assert.Equal(3, JsonSerializer.SerializeToElement(result).GetProperty("value").GetInt32());
    }

    [Fact]
    public async Task ToolPage_run_that_throws_faults_the_call_so_the_element_shows_its_error_state()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, _ => throw new InvalidOperationException("boom")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => cut.InvokeAsync(() => host.Value.Invoke(Values("{}"))));
        Assert.Equal("boom", e.Message);
    }

    [Fact]
    public async Task ToolPage_clears_the_callback_when_Run_is_removed_and_releases_the_reference_on_dispose()
    {
        var cut = Render<PkToolPage>(p => p.Add(x => x.Run, _ => Task.FromResult<object?>("ok")));
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost>>(Assert.Single(_bridge.Invocations["setCallback"]).Arguments[2]);

        cut.Render(p => p.Add<Func<IReadOnlyDictionary<string, JsonElement>, Task<object?>>?>(x => x.Run, null));
        Assert.Equal(2, _bridge.Invocations["setCallback"].Count);
        Assert.Null(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        Assert.Throws<ObjectDisposedException>(() => host.Value);

        // and once more set, then disposed with the component
        cut.Render(p => p.Add(x => x.Run, _ => Task.FromResult<object?>("ok")));
        var again = Assert.IsType<DotNetObjectReference<PkCallbackHost>>(_bridge.Invocations["setCallback"].Last().Arguments[2]);
        await DisposeComponentsAsync();
        Assert.Throws<ObjectDisposedException>(() => again.Value);
    }

    [Fact]
    public async Task SettingsPage_save_reaches_the_delegate_and_returns_nothing()
    {
        IReadOnlyDictionary<string, JsonElement>? saved = null;
        var cut = Render<PkSettingsPage>(p => p.Add(x => x.Values, "{\"density\":\"cozy\"}").Add(x => x.Save, v => { saved = v; return Task.CompletedTask; }));

        Assert.Equal("{\"density\":\"cozy\"}", cut.Find("pk-settings-page").GetAttribute("values"));
        var call = Assert.Single(_bridge.Invocations["setCallback"]);
        Assert.Equal("save", call.Arguments[1]);
        var host = Assert.IsType<DotNetObjectReference<PkCallbackHost>>(call.Arguments[2]);
        var result = await cut.InvokeAsync(() => host.Value.Invoke(Values("{\"density\":\"compact\",\"beta\":true}")));

        Assert.Null(result);
        Assert.Equal("compact", saved!["density"].GetString());
        Assert.True(saved["beta"].GetBoolean());
    }
}
