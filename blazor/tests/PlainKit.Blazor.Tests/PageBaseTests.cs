using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 204: the page-level state (status/error, busy, title, breadcrumbs) a concrete page otherwise repeats by hand.
public sealed class PageBaseTests : BunitContext
{
    private sealed class FakeLog : IPkLog
    {
        public readonly List<(PkLogLevel Level, string Scope, string Message, string? Detail)> Entries = [];
        public ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null)
        {
            Entries.Add((level, scope, message, detail));
            return ValueTask.CompletedTask;
        }
        public ValueTask SetLevelAsync(PkLogLevel level) => ValueTask.CompletedTask;
        public ValueTask ConfigureAsync(PkLoggingOptions settings) => ValueTask.CompletedTask;
    }

    private readonly FakeLog Log = new();

    public PageBaseTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddSingleton<IPkLog>(Log);
    }

    [Fact]
    public void SetStatus_shows_the_message_kind_and_heading_and_re_renders()
    {
        var cut = Render<PageBaseHost>();
        cut.InvokeAsync(() => cut.Instance.CallSetStatus("Saved.", "success", "Done"));
        Assert.Equal("Saved.", cut.Instance.StatusMessage);
        Assert.Equal("success", cut.Instance.StatusKind);
        Assert.Equal("Done", cut.Instance.StatusHeading);
        cut.WaitForAssertion(() => Assert.Contains("Saved.", cut.Markup));
    }

    [Fact]
    public void ClearStatus_clears_the_message_and_heading()
    {
        var cut = Render<PageBaseHost>();
        cut.InvokeAsync(() => cut.Instance.CallSetStatus("Saved.", "success", "Done"));
        cut.InvokeAsync(() => cut.Instance.CallClearStatus());
        Assert.Null(cut.Instance.StatusMessage);
        Assert.Null(cut.Instance.StatusHeading);
    }

    [Fact]
    public async Task SetErrorAsync_logs_through_IPkLog_under_the_page_s_scope_and_shows_a_danger_status()
    {
        var cut = Render<PageBaseHost>();
        var exception = new InvalidOperationException("order not found");

        await cut.InvokeAsync(() => cut.Instance.CallSetErrorAsync(exception));

        Assert.Single(Log.Entries);
        Assert.Equal(PkLogLevel.Error, Log.Entries[0].Level);
        Assert.Equal(nameof(PageBaseHost), Log.Entries[0].Scope);
        Assert.Equal("order not found", Log.Entries[0].Message);
        Assert.Contains("InvalidOperationException", Log.Entries[0].Detail);
        Assert.Equal("order not found", cut.Instance.StatusMessage);
        Assert.Equal("danger", cut.Instance.StatusKind);
    }

    [Fact]
    public async Task SetErrorAsync_takes_an_explicit_message_override()
    {
        var cut = Render<PageBaseHost>();
        await cut.InvokeAsync(() => cut.Instance.CallSetErrorAsync(new Exception("ORDER_404"), "Order not found."));
        Assert.Equal("Order not found.", cut.Instance.StatusMessage);
    }

    [Fact]
    public async Task BusyAsync_sets_and_clears_IsBusy_and_the_label_around_the_action()
    {
        var cut = Render<PageBaseHost>();
        var sawBusyDuring = false;

        var result = await cut.InvokeAsync(() => cut.Instance.CallBusyAsync(() =>
        {
            sawBusyDuring = cut.Instance.IsBusy;
            return Task.FromResult(42);
        }, "Loading…"));

        Assert.Equal(42, result);
        Assert.True(sawBusyDuring);
        Assert.False(cut.Instance.IsBusy);
        Assert.Equal("Loading…", cut.Instance.BusyLabel);
    }

    [Fact]
    public async Task BusyAsync_logs_and_shows_a_rejection_as_a_danger_status_clears_busy_and_rethrows()
    {
        var cut = Render<PageBaseHost>();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            cut.InvokeAsync(() => cut.Instance.CallBusyAsync(() => throw new InvalidOperationException("network down"))));

        Assert.False(cut.Instance.IsBusy);
        Assert.Equal("network down", cut.Instance.StatusMessage);
        Assert.Equal("danger", cut.Instance.StatusKind);
        Assert.Single(Log.Entries);
    }

    [Fact]
    public void Title_and_Crumbs_are_plain_settable_state_for_binding_into_PkPageHeader()
    {
        var cut = Render<PageBaseHost>();
        cut.Instance.Title = "Orders";
        cut.Instance.Crumbs = [new PkCrumb("Home", "/"), new PkCrumb("Orders")];
        Assert.Equal("Orders", cut.Instance.Title);
        Assert.Equal(2, cut.Instance.Crumbs.Count);
    }
}
