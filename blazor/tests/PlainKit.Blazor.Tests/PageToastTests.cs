using System.ComponentModel.DataAnnotations;
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #855: PageBase.ShowSuccess/ShowWarning/ShowError over IPkNotifications, and PkRecordEditor's default toasts (opt-in through a notifier, Messages words or silences them).
public sealed class PageToastTests : BunitContext
{
    private sealed class FakeNotifications : IPkNotifications
    {
        public readonly List<(string Kind, string Title, string? Details)> Shown = [];
        private ValueTask Add(string kind, string title, string? details) { Shown.Add((kind, title, details)); return ValueTask.CompletedTask; }
        public ValueTask InfoAsync(string title, string? details = null, TimeSpan? duration = null) => Add("info", title, details);
        public ValueTask SuccessAsync(string title, string? details = null, TimeSpan? duration = null) => Add("success", title, details);
        public ValueTask WarnAsync(string title, string? details = null, TimeSpan? duration = null) => Add("warn", title, details);
        public ValueTask ErrorAsync(string title, string? details = null, TimeSpan? duration = null) => Add("error", title, details);
    }

    private sealed class FakeLog : IPkLog
    {
        public readonly List<string> Entries = [];
        public ValueTask WriteAsync(PkLogLevel level, string scope, string message, string? detail = null) { Entries.Add(message); return ValueTask.CompletedTask; }
        public ValueTask SetLevelAsync(PkLogLevel level) => ValueTask.CompletedTask;
        public ValueTask ConfigureAsync(PkLoggingOptions settings) => ValueTask.CompletedTask;
    }

    private sealed class RuleException(string message) : InvalidOperationException(message), IPkUserFacingException;
    private sealed class Row { public int Id { get; set; } public string Name { get; set; } = ""; }
    private sealed class RowForm { [Required(ErrorMessage = "Name is required.")] public string Name { get; set; } = ""; }

    private readonly FakeNotifications Notes = new();
    private readonly FakeLog Log = new();

    public PageToastTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddPlainKit();
        Services.AddScoped<IPkNotifications>(_ => Notes);
        Services.AddSingleton<IPkLog>(Log);
    }

    [Fact]
    public async Task PageBase_shows_success_warning_and_error_toasts_through_the_notifications_service()
    {
        var cut = Render<PageBaseHost>();
        await cut.InvokeAsync(async () =>
        {
            await cut.Instance.CallShowSuccess("Saved", "Order 7");
            await cut.Instance.CallShowWarning("Low stock");
            await cut.Instance.CallShowError("Could not save", "Server said no");
        });
        Assert.Equal([("success", "Saved", "Order 7"), ("warn", "Low stock", null), ("error", "Could not save", "Server said no")], Notes.Shown);
    }

    [Fact]
    public async Task PageBase_ShowError_with_an_exception_logs_it_and_shows_a_user_facing_message_as_it_is_and_any_other_as_a_generic_line()
    {
        var cut = Render<PageBaseHost>();
        await cut.InvokeAsync(async () =>
        {
            await cut.Instance.CallShowError(new RuleException("Only one location can be primary."), "Could not save");
            await cut.Instance.CallShowError(new InvalidOperationException("secret connection string"), "Could not save");
        });
        Assert.Equal(("error", "Could not save", "Only one location can be primary."), Notes.Shown[0]);
        Assert.Equal(("error", "Could not save", "Something went wrong. See the log for details."), Notes.Shown[1]);
        Assert.Equal(2, Log.Entries.Count);
    }

    private static PkRecordEditor<Row, RowForm, int> Editor(IPkNotifications? notify, Func<RowForm, Row?, Task> save, Func<Row, Task>? delete = null, PkRecordMessages? messages = null) =>
        new(NullLogger.Instance, "row", id => Task.FromResult<Row?>(new Row { Id = id, Name = "one" }), r => new RowForm { Name = r?.Name ?? "" }, save, delete)
        { Notify = notify, Messages = messages ?? new() };

    [Fact]
    public async Task The_editor_without_a_notifier_toasts_nothing()
    {
        var editor = Editor(null, (f, r) => Task.CompletedTask);
        editor.StartNew(); editor.Form!.Name = "x";
        Assert.True(await editor.SaveAsync());
        Assert.Empty(Notes.Shown);
    }

    [Fact]
    public async Task The_editor_with_a_notifier_toasts_saved_deleted_and_the_failures_with_neutral_wording()
    {
        var fail = false;
        var editor = Editor(Notes, (f, r) => fail ? throw new RuleException("Name taken.") : Task.CompletedTask, r => Task.CompletedTask);
        await editor.LoadAsync(1);
        Assert.True(await editor.SaveAsync());
        fail = true;
        Assert.False(await editor.SaveAsync());
        Assert.True(await editor.DeleteAsync());
        Assert.Equal([("success", "Saved", null), ("error", "Could not save", "Name taken."), ("success", "Deleted", null)], Notes.Shown);
    }

    [Fact]
    public async Task Validation_problems_stay_inline_and_Messages_words_or_silences_a_toast()
    {
        var editor = Editor(Notes, (f, r) => Task.CompletedTask, r => throw new RuleException("In use."), new PkRecordMessages(Saved: "Order saved", Deleted: "", Failed: "Not possible"));
        editor.StartNew();
        Assert.False(await editor.SaveAsync());
        Assert.Empty(Notes.Shown);
        editor.Form!.Name = "x";
        Assert.True(await editor.SaveAsync());
        await editor.LoadAsync(1);
        Assert.False(await editor.DeleteAsync());
        Assert.Equal([("success", "Order saved", null), ("error", "Not possible", "In use.")], Notes.Shown);
    }
}
