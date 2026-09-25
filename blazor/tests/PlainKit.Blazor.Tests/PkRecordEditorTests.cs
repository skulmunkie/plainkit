using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// Issue 261: the load / validate / save / delete state of one create-or-edit record page.
public sealed class PkRecordEditorTests
{
    private sealed class Row { public int Id { get; set; } public string Name { get; set; } = ""; }

    private sealed class RowForm
    {
        [Required(ErrorMessage = "Name is required.")] public string Name { get; set; } = "";
    }

    // An app's own exception base carries the marker; this one stands in for it.
    private sealed class RuleException(string message) : InvalidOperationException(message), IPkUserFacingException;

    private sealed class ListLogger : ILogger
    {
        public List<(LogLevel Level, string Message, Exception? Error)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception), exception));
    }

    private static PkRecordEditor<Row, RowForm, int> New(Func<Exception, bool> isUserFacing, Func<RowForm, Row?, Task> save, ILogger? logger = null) =>
        new(logger ?? NullLogger.Instance, "row", id => Task.FromResult<Row?>(new Row { Id = id, Name = "one" }), r => new RowForm { Name = r?.Name ?? "" }, save)
        { IsUserFacing = isUserFacing };

    private static PkRecordEditor<Row, RowForm, int> New(
        Func<int, Task<Row?>>? load = null,
        Func<RowForm, Row?, Task>? save = null,
        Func<Row, Task>? delete = null,
        ILogger? logger = null) =>
        new(logger ?? NullLogger.Instance, "row",
            load ?? (id => Task.FromResult<Row?>(id == 1 ? new Row { Id = 1, Name = "one" } : null)),
            r => new RowForm { Name = r?.Name ?? "" },
            save ?? ((_, _) => Task.CompletedTask),
            delete);

    [Fact]
    public void StartNew_gives_a_blank_form_and_no_record()
    {
        var e = New();
        e.StartNew();

        Assert.True(e.IsNew);
        Assert.NotNull(e.Form);
        Assert.Equal("", e.Form!.Name);
        Assert.False(e.NotFound);
    }

    [Fact]
    public async Task A_known_id_loads_the_record_into_the_form()
    {
        var e = New();
        await e.LoadAsync(1);

        Assert.False(e.IsNew);
        Assert.Equal(1, e.Record!.Id);
        Assert.Equal("one", e.Form!.Name);
    }

    [Fact]
    public async Task An_unknown_id_is_flagged_not_found_and_clears_an_earlier_record()
    {
        var e = New();
        await e.LoadAsync(1);
        await e.LoadAsync(99);

        Assert.True(e.NotFound);
        Assert.Null(e.Form);
        Assert.Null(e.Record);
        Assert.False(await e.SaveAsync());
    }

    [Fact]
    public async Task The_key_can_be_any_type()
    {
        var e = new PkRecordEditor<Row, RowForm, string>(NullLogger.Instance, "row",
            key => Task.FromResult<Row?>(key == "a-1" ? new Row { Id = 7, Name = "seven" } : null),
            r => new RowForm { Name = r?.Name ?? "" }, (_, _) => Task.CompletedTask);

        await e.LoadAsync("a-1");

        Assert.Equal(7, e.Record!.Id);
    }

    [Fact]
    public async Task An_invalid_form_is_refused_with_its_messages_and_not_saved()
    {
        var saved = false;
        var e = New(save: (_, _) => { saved = true; return Task.CompletedTask; });
        e.StartNew();

        Assert.False(await e.SaveAsync());

        Assert.False(saved);
        Assert.Equal("Name is required.", e.Error);
    }

    [Fact]
    public async Task A_valid_form_saves_with_the_existing_record_and_is_busy_meanwhile()
    {
        Row? seen = null;
        var busyInside = false;
        PkRecordEditor<Row, RowForm, int>? e = null;
        e = New(save: (_, r) => { seen = r; busyInside = e!.Busy; return Task.CompletedTask; });
        await e.LoadAsync(1);

        Assert.True(await e.SaveAsync());

        Assert.Equal(1, seen!.Id);
        Assert.True(busyInside);
        Assert.False(e.Busy);
        Assert.Null(e.Error);
    }

    [Fact]
    public async Task A_second_save_while_one_is_running_is_refused()
    {
        var release = new TaskCompletionSource();
        var saves = 0;
        var e = New(save: async (_, _) => { saves++; await release.Task; });
        await e.LoadAsync(1);

        var first = e.SaveAsync();
        var second = await e.SaveAsync();
        release.SetResult();

        Assert.False(second);
        Assert.True(await first);
        Assert.Equal(1, saves);
    }

    [Fact]
    public async Task A_user_facing_exception_shows_its_own_message_and_is_not_logged()
    {
        var log = new ListLogger();
        var e = New(save: (_, _) => throw new RuleException("Only one location can be primary."), logger: log);
        await e.LoadAsync(1);

        Assert.False(await e.SaveAsync());

        Assert.Equal("Only one location can be primary.", e.Error);
        Assert.Empty(log.Entries);
        Assert.False(e.Busy);
    }

    [Fact]
    public async Task IsUserFacing_shows_the_message_of_an_exception_without_the_marker()
    {
        var log = new ListLogger();
        var e = New(ex => ex is ArgumentException, (_, _) => throw new ArgumentException("Name is taken."), log);
        await e.LoadAsync(1);

        Assert.False(await e.SaveAsync());
        Assert.Equal("Name is taken.", e.Error);
        Assert.Empty(log.Entries);
    }

    [Fact]
    public async Task IsUserFacing_is_consulted_in_addition_to_the_marker()
    {
        var e = New(_ => false, (_, _) => throw new RuleException("Marked."));
        await e.LoadAsync(1);

        Assert.False(await e.SaveAsync());
        Assert.Equal("Marked.", e.Error);
    }

    [Fact]
    public async Task IsUserFacing_throwing_keeps_the_generic_line()
    {
        var log = new ListLogger();
        var e = New(_ => throw new InvalidOperationException("bad predicate"), (_, _) => throw new ArgumentException("secret"), log);
        await e.LoadAsync(1);

        Assert.False(await e.SaveAsync());
        Assert.Equal("Unexpected error while saving. See log for details.", e.Error);
        Assert.Equal(2, log.Entries.Count);
    }

    [Fact]
    public async Task An_unexpected_failure_shows_a_generic_line_and_is_logged()
    {
        var log = new ListLogger();
        var e = New(save: (_, _) => throw new InvalidOperationException("db exploded"), logger: log);
        await e.LoadAsync(1);

        Assert.False(await e.SaveAsync());

        Assert.Equal("Unexpected error while saving. See log for details.", e.Error);
        var entry = Assert.Single(log.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Contains("saving row", entry.Message);
        Assert.Equal("db exploded", entry.Error!.Message);
    }

    [Fact]
    public async Task Delete_needs_a_record_and_a_delete_delegate()
    {
        var deleted = 0;
        var withDelete = New(delete: _ => { deleted++; return Task.CompletedTask; });
        var without = New();

        withDelete.StartNew();
        Assert.False(withDelete.CanDelete);
        Assert.False(await withDelete.DeleteAsync());

        await withDelete.LoadAsync(1);
        Assert.True(withDelete.CanDelete);
        Assert.True(await withDelete.DeleteAsync());
        Assert.Equal(1, deleted);

        await without.LoadAsync(1);
        Assert.False(without.CanDelete);
    }

    [Fact]
    public async Task A_failed_delete_reports_through_Error_and_ClearError_clears_it()
    {
        var e = New(delete: _ => throw new RuleException("Location is in use."));
        await e.LoadAsync(1);

        Assert.False(await e.DeleteAsync());
        Assert.Equal("Location is in use.", e.Error);

        e.ClearError();
        Assert.Null(e.Error);
    }
}
