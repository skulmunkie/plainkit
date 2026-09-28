using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 373: IPkNotifications and IPkDialogs go to the bridge as plain data (js/notify.js, js/dialogs.js do the work).
public sealed class PkNotifyDialogsTests : BunitContext, IAsyncLifetime
{
    private sealed class FakeStorage : IPkStorage
    {
        public readonly List<string> Warnings = [];
        public ValueTask<string?> GetAsync(string key) => ValueTask.FromResult<string?>(null);
        public ValueTask SetAsync(string key, string value) => ValueTask.CompletedTask;
        public void Warn(string message) => Warnings.Add(message);
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    private readonly FakeStorage Log = new();
    private readonly BunitJSModuleInterop Bridge;

    public PkNotifyDialogsTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Bridge = JSInterop.SetupModule(PkAssets.Bridge);
        Services.AddPlainKit();
        Services.AddScoped<IPkStorage>(_ => Log);
    }

    [Fact]
    public async Task Notifications_pass_kind_title_details_and_duration_in_milliseconds()
    {
        var n = Services.GetRequiredService<IPkNotifications>();
        await n.SuccessAsync("Saved", "Order 1042", TimeSpan.FromSeconds(2));
        await n.ErrorAsync("Failed");
        var calls = Bridge.Invocations.Where(i => i.Identifier == "notify").ToList();
        Assert.Equal(["success", "Saved", "Order 1042", 2000.0], calls[0].Arguments);
        Assert.Equal(["error", "Failed", null, null], calls[1].Arguments);
    }

    [Fact]
    public async Task Confirm_is_true_only_for_a_true_answer()
    {
        var d = Services.GetRequiredService<IPkDialogs>();
        Bridge.Setup<bool?>("dialog", _ => true).SetResult(true);
        Assert.True(await d.ConfirmAsync(new() { Heading = "Delete?", Danger = true }));
    }

    [Fact]
    public async Task Confirm_is_false_when_cancelled()
    {
        Bridge.Setup<bool?>("dialog", _ => true).SetResult(null);
        Assert.False(await Services.GetRequiredService<IPkDialogs>().ConfirmAsync(new() { Heading = "Delete?" }));
    }

    [Fact]
    public async Task Prompt_and_open_return_their_answers_and_send_camel_case_config_without_nulls()
    {
        var d = Services.GetRequiredService<IPkDialogs>();
        Bridge.Setup<string?>("dialog", a => (string)a.Arguments[1]! == "prompt").SetResult("Draft 2");
        Bridge.Setup<PkDialogResult?>("dialog", a => (string)a.Arguments[1]! == "open").SetResult(new("ok", new Dictionary<string, string> { ["email"] = "a@b.c" }));
        Assert.Equal("Draft 2", await d.PromptAsync(new() { Heading = "Rename", Value = "Draft", Required = true }));
        var r = await d.OpenAsync(new() { Heading = "New", Fields = [new("email", "Email", Type: "email", Required: true)], Actions = [new("Create")] });
        Assert.Equal("ok", r!.Action);
        Assert.Equal("a@b.c", r.Values["email"]);
        var sent = Bridge.Invocations.Where(i => i.Identifier == "dialog").Select(i => i.Arguments[2]!.ToString()!).ToList();
        Assert.Contains("\"value\":\"Draft\"", sent[0]);
        Assert.DoesNotContain("message", sent[0]);
        Assert.Contains("\"fields\":[{\"name\":\"email\",\"label\":\"Email\",\"type\":\"email\",\"required\":true,\"maxLength\":0}]", sent[1]);
    }

    [Fact]
    public async Task Every_call_of_one_service_shares_a_scope_which_disposing_ends()
    {
        var d = Services.GetRequiredService<IPkDialogs>();
        await d.AlertAsync(new() { Heading = "Done" });
        await d.AlertAsync(new() { Heading = "Again" });
        await d.DisposeAsync();
        var scopes = Bridge.Invocations.Where(i => i.Identifier is "dialog" or "endDialogs").Select(i => (string)i.Arguments[0]!).ToList();
        Assert.Equal(3, scopes.Count);
        Assert.Single(scopes.Distinct());
        Assert.Equal("endDialogs", Bridge.Invocations.Last().Identifier);
    }

    [Fact]
    public async Task A_page_without_javascript_is_cancelled_with_one_warning_never_an_exception()
    {
        Bridge.Setup<bool?>("dialog", _ => true).SetException(new JSException("no page"));
        Bridge.SetupVoid("notify", _ => true).SetException(new JSException("no page"));
        Assert.False(await Services.GetRequiredService<IPkDialogs>().ConfirmAsync(new() { Heading = "x" }));
        await Services.GetRequiredService<IPkNotifications>().InfoAsync("hi");
        Assert.Equal(2, Log.Warnings.Count);
    }
}
