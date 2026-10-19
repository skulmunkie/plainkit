using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 1545: PageBase and PkRecordEditor busy state reaches the page-level overlay of PkApp with no per-page binding.
public sealed class PkBusyTests : BunitContext, IAsyncLifetime
{
    private sealed class Overview : IPkModule { public PkModuleManifest Manifest => new() { Id = "overview", Title = "Overview" }; }

    private sealed class QuietLog : IPkLog
    {
        public ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null) => ValueTask.CompletedTask;
        public ValueTask SetLevelAsync(PkLogLevel level) => ValueTask.CompletedTask;
        public ValueTask ConfigureAsync(PkLoggingOptions settings) => ValueTask.CompletedTask;
    }

    Task IAsyncLifetime.InitializeAsync() => Task.CompletedTask;
    async Task IAsyncLifetime.DisposeAsync() => await DisposeAsync();

    public PkBusyTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddPlainKitApp(a => a.Brand("Demo").Module<Overview>().Home("overview"));
        Services.AddSingleton<IPkLog>(new QuietLog());
    }

    private PkBusyState State => Services.GetRequiredService<PkBusyState>();

    private static IDisposable Begin(IRenderedComponent<PageBaseHost> c, string label) => c.InvokeAsync(() => c.Instance.CallBeginBusy(label)).Result;

    // #1586: static SSR disposes the request scope before the renderer disposes the page; dispose must not resolve anything from it.
    [Fact]
    public async Task Disposing_a_page_after_its_service_scope_is_gone_does_not_throw()
    {
        var c = Render<PageBaseHost>();
        Services.Dispose();
        await ((IAsyncDisposable)c.Instance).DisposeAsync();
    }

    [Fact]
    public void State_is_counted_per_owner_and_labelled_by_the_latest()
    {
        var s = new PkBusyState();
        var changes = 0;
        s.Changed += () => changes++;
        object a = new(), b = new();
        s.Set(a, true, "A");
        s.Set(b, true, "B");
        Assert.True(s.IsBusy);
        Assert.Equal("B", s.Label);
        s.Set(b, false);
        Assert.True(s.IsBusy);
        Assert.Equal("A", s.Label);
        s.Set(a, false);
        Assert.False(s.IsBusy);
        Assert.Equal("A", s.Label);
        Assert.Equal(4, changes);
    }

    [Fact]
    public void State_ignores_repeats_and_an_owner_that_was_never_busy()
    {
        var s = new PkBusyState();
        var changes = 0;
        s.Changed += () => changes++;
        object a = new();
        s.Set(a, false);
        s.Set(a, true, "A");
        s.Set(a, true, "A");
        Assert.Equal(1, changes);
    }

    [Fact]
    public void A_busy_page_turns_the_frames_overlay_on_and_idle_turns_it_off_with_no_binding_on_the_page()
    {
        var app = Render<PkApp>();
        var page = Render<PageBaseHost>();
        Assert.False(app.Find("pk-app-frame").HasAttribute("busy"));
        var busy = Begin(page, "Saving…");
        app.WaitForAssertion(() => Assert.True(app.Find("pk-app-frame").HasAttribute("busy")));
        Assert.Equal("Saving…", app.Find("pk-app-frame").GetAttribute("busy-label"));
        page.InvokeAsync(busy.Dispose);
        app.WaitForAssertion(() => Assert.False(app.Find("pk-app-frame").HasAttribute("busy")));
    }

    [Fact]
    public void Overlapping_actions_on_two_pages_keep_busy_until_the_last_ends()
    {
        var first = Render<PageBaseHost>();
        var second = Render<PageBaseHost>();
        var a = Begin(first, "A");
        var b = Begin(second, "B");
        first.InvokeAsync(a.Dispose);
        Assert.True(State.IsBusy);
        second.InvokeAsync(b.Dispose);
        Assert.False(State.IsBusy);
    }

    [Fact]
    public async Task Disposing_a_busy_page_releases_busy()
    {
        var page = Render<PageBaseHost>();
        Begin(page, "A");
        Assert.True(State.IsBusy);
        await page.InvokeAsync(async () => await ((IAsyncDisposable)page.Instance).DisposeAsync());
        Assert.False(State.IsBusy);
    }

    [Fact]
    public void A_page_that_opts_out_does_not_block()
    {
        var page = Render<PageBaseHost>(p => p.Add(x => x.Blocks, false));
        Begin(page, "A");
        Assert.True(page.Instance.IsBusy);
        Assert.False(State.IsBusy);
    }

    [Fact]
    public void A_busy_change_does_not_reload_the_page_in_the_frame()
    {
        var loads = 0;
        var app = Render<PkApp>(p => p.AddChildContent<LoadCountingPage>(c => c.Add(x => x.Loads, () => loads++)));
        var before = loads;
        State.Set(this, true, "x");
        app.WaitForAssertion(() => Assert.True(app.Find("pk-app-frame").HasAttribute("busy")));
        Assert.Equal(before, loads);
    }

    [Fact]
    public async Task A_record_editor_save_reports_busy_and_clears_it_on_success_and_failure()
    {
        var seen = new List<bool>();
        var gate = new TaskCompletionSource();
        var editor = new PkRecordEditor<object, object, int>(NullLogger.Instance, "row", _ => Task.FromResult<object?>(new object()), _ => new object(),
            async (_, _) => { seen.Add(State.IsBusy); await gate.Task; }) { PageBusy = State };
        editor.StartNew();
        var save = editor.SaveAsync();
        Assert.True(State.IsBusy);
        Assert.Equal("saving", State.Label);
        gate.SetResult();
        Assert.True(await save);
        Assert.False(State.IsBusy);
        Assert.Equal([true], seen);

        var failing = new PkRecordEditor<object, object, int>(NullLogger.Instance, "row", _ => Task.FromResult<object?>(null), _ => new object(),
            (_, _) => throw new InvalidOperationException("no")) { PageBusy = State };
        failing.StartNew();
        Assert.False(await failing.SaveAsync());
        Assert.False(State.IsBusy);
    }

    [Fact]
    public void Disposing_a_busy_editor_releases_busy()
    {
        var editor = new PkRecordEditor<object, object, int>(NullLogger.Instance, "row", _ => Task.FromResult<object?>(null), _ => new object(), (_, _) => Task.CompletedTask) { PageBusy = State };
        State.Set(editor, true, "saving");
        editor.Dispose();
        Assert.False(State.IsBusy);
    }
}
