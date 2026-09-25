using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Logging;

namespace PlainKit.Blazor;

/// <summary>
/// Marks an exception whose <see cref="Exception.Message"/> is written for the person using the app (a domain rule: "Only one location can be
/// primary."), so <see cref="PkRecordEditor{TRecord, TForm, TKey}"/> shows it as it is. An interface, so an app puts it on the exception base type
/// it already has; any exception without it is logged and shown as a generic line.
/// </summary>
public interface IPkUserFacingException;

/// <summary>
/// The load, validate, save and delete state of one create-or-edit record page (issue 261), so the page declares only what is specific to its
/// record (how to load it, map it to a form and store it). It pairs with <c>PkRecordForm</c>, which draws the page; neither needs the other.
/// </summary>
/// <remarks>
/// <typeparamref name="TRecord"/> is the stored thing (null while adding); <typeparamref name="TForm"/> is the editable copy the fields bind to,
/// validated with its DataAnnotations (<c>IValidatableObject</c> too). A failure that is an <see cref="IPkUserFacingException"/> shows its own
/// message; any other exception is logged with <paramref name="noun"/> and shown as a generic line.
/// </remarks>
/// <typeparam name="TRecord">The stored record.</typeparam>
/// <typeparam name="TForm">The editable copy the fields bind to.</typeparam>
/// <typeparam name="TKey">The record's id (<c>int</c>, <c>Guid</c>, <c>string</c>).</typeparam>
/// <param name="logger">Receives unexpected failures.</param>
/// <param name="noun">What the record is called in the log ("location").</param>
/// <param name="load">Loads a record by id; null when there is none.</param>
/// <param name="toForm">Makes the form: from the record, or from null for a new one.</param>
/// <param name="save">Stores the form; the record is null for a new one.</param>
/// <param name="delete">Deletes a record; without it the page cannot delete (<see cref="CanDelete"/> stays false).</param>
public sealed class PkRecordEditor<TRecord, TForm, TKey>(
    ILogger logger,
    string noun,
    Func<TKey, Task<TRecord?>> load,
    Func<TRecord?, TForm> toForm,
    Func<TForm, TRecord?, Task> save,
    Func<TRecord, Task>? delete = null)
    where TRecord : class
    where TForm : class
    where TKey : notnull
{
    /// <summary>The form the fields bind to; null until <see cref="LoadAsync"/> or <see cref="StartNew"/> has run, and after a not-found load.</summary>
    public TForm? Form { get; private set; }

    /// <summary>The stored record being edited; null while adding.</summary>
    public TRecord? Record { get; private set; }

    /// <summary>True while adding: there is no stored record.</summary>
    public bool IsNew => Record is null;

    /// <summary>The id asked for does not exist; the page redirects to its list.</summary>
    public bool NotFound { get; private set; }

    /// <summary>A save or delete is running; a second one is refused.</summary>
    public bool Busy { get; private set; }

    /// <summary>The message to show (validation messages, a user-facing failure or the generic line); null when there is none.</summary>
    public string? Error { get; private set; }

    /// <summary>Whether the page can offer Delete: something to delete, and a way to do it.</summary>
    public bool CanDelete => delete is not null && Record is not null;

    /// <summary>A blank form for a new record.</summary>
    public void StartNew()
    {
        Error = null;
        NotFound = false;
        Record = null;
        Form = toForm(null);
    }

    /// <summary>Loads record <paramref name="id"/> for editing. When there is none, <see cref="NotFound"/> is set and <see cref="Form"/> and <see cref="Record"/> are cleared.</summary>
    public async Task LoadAsync(TKey id)
    {
        Error = null;
        NotFound = false;
        var record = await load(id);
        if (record is null)
        {
            NotFound = true;
            Record = null;
            Form = null;
            return;
        }

        Record = record;
        Form = toForm(record);
    }

    /// <summary>Validates the form, then saves it. True when saved; otherwise <see cref="Error"/> says why.</summary>
    public async Task<bool> SaveAsync()
    {
        if (Form is null || Busy) return false;
        Error = null;

        var problems = new List<ValidationResult>();
        if (!Validator.TryValidateObject(Form, new ValidationContext(Form), problems, validateAllProperties: true))
        {
            Error = string.Join(" ", problems.Select(p => p.ErrorMessage));
            return false;
        }

        return await RunAsync(() => save(Form, Record), "saving");
    }

    /// <summary>Deletes the record being edited. True when deleted.</summary>
    public async Task<bool> DeleteAsync()
    {
        if (delete is null || Record is not { } record || Busy) return false;
        Error = null;
        return await RunAsync(() => delete(record), "deleting");
    }

    /// <summary>Clears <see cref="Error"/>.</summary>
    public void ClearError() => Error = null;

    private async Task<bool> RunAsync(Func<Task> action, string verb)
    {
        Busy = true;
        try
        {
            await action();
            return true;
        }
        catch (Exception ex) when (ex is IPkUserFacingException)
        {
            Error = ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed {Verb} {Noun}", verb, noun);
            Error = $"Unexpected error while {verb}. See log for details.";
            return false;
        }
        finally
        {
            Busy = false;
        }
    }
}
