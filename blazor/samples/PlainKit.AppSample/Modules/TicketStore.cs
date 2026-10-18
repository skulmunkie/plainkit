using PlainKit.Blazor;

namespace PlainKit.AppSample.Modules;

/// <summary>A record with one property per <see cref="PkFieldKind"/>, as strings (the shape the specs deal in). The lab pages (/lab/*) use it to drive paths the harness must cross for real.</summary>
public sealed class Ticket
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Estimate { get; set; } = "";
    public string Email { get; set; } = "";
    public string Secret { get; set; } = "";
    public string Due { get; set; } = "";
    public string Opened { get; set; } = "";
    public string At { get; set; } = "";
    public string Site { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Kind { get; set; } = "bug";
    public string Done { get; set; } = "";
    public string Owner { get; set; } = "";

    public static readonly PkFieldOption[] Kinds = [new("bug", "Bug"), new("task", "Task")];

    /// <summary>Every kind, DateTime and a ColumnSpan included.</summary>
    public static readonly PkFieldSpec<Ticket>[] Specs =
    [
        new() { Key = "title", Label = "Title", MaxLength = "40", Get = t => t.Title, Set = (t, v) => t.Title = v ?? "" },
        new() { Key = "notes", Label = "Notes", Kind = PkFieldKind.Textarea, Get = t => t.Notes, Set = (t, v) => t.Notes = v ?? "", ColumnSpan = 2 },
        new() { Key = "estimate", Label = "Estimate", Kind = PkFieldKind.Number, Get = t => t.Estimate, Set = (t, v) => t.Estimate = v ?? "" },
        new() { Key = "email", Label = "Email", Kind = PkFieldKind.Email, Get = t => t.Email, Set = (t, v) => t.Email = v ?? "" },
        new() { Key = "secret", Label = "Secret", Kind = PkFieldKind.Password, AutoComplete = "new-password", Get = t => t.Secret, Set = (t, v) => t.Secret = v ?? "" },
        new() { Key = "due", Label = "Due", Kind = PkFieldKind.Date, Get = t => t.Due, Set = (t, v) => t.Due = v ?? "" },
        new() { Key = "opened", Label = "Opened", Kind = PkFieldKind.DateTime, Get = t => t.Opened, Set = (t, v) => t.Opened = v ?? "" },
        new() { Key = "at", Label = "Time of day", Kind = PkFieldKind.Time, Get = t => t.At, Set = (t, v) => t.At = v ?? "" },
        new() { Key = "site", Label = "Site", Kind = PkFieldKind.Url, Get = t => t.Site, Set = (t, v) => t.Site = v ?? "" },
        new() { Key = "phone", Label = "Phone", Kind = PkFieldKind.Tel, Get = t => t.Phone, Set = (t, v) => t.Phone = v ?? "" },
        new() { Key = "kind", Label = "Kind", Kind = PkFieldKind.Select, Options = Kinds, Get = t => t.Kind, Set = (t, v) => t.Kind = v ?? "" },
        new() { Key = "done", Label = "Done", Kind = PkFieldKind.Checkbox, Get = t => t.Done, Set = (t, v) => t.Done = v ?? "" },
        new() { Key = "owner", Label = "Owner", Kind = PkFieldKind.Combobox, Options = [new("ada", "Ada"), new("grace", "Grace")], Get = t => t.Owner, Set = (t, v) => t.Owner = v ?? "" },
    ];
}

public static class TicketStore
{
    private static readonly List<Ticket> _all = Enumerable.Range(1, 5).Select(i => new Ticket { Id = i.ToString(), Title = "Ticket " + i, Notes = "Notes " + i }).ToList();

    /// <summary>A slow load honours the request's token: a newer request or leaving the page cancels it (the abort path).</summary>
    public static async Task<PkListResult<Ticket>> ListAsync(PkListRequest r, bool slow)
    {
        if (slow) await Task.Delay(1500, r.CancellationToken);
        var rows = _all.Where(t => r.Search is null || t.Title.Contains(r.Search, StringComparison.OrdinalIgnoreCase)).ToList();
        return new PkListResult<Ticket>(rows, rows.Count);
    }

    public static Task<Ticket?> GetAsync(string id) => Task.FromResult(_all.FirstOrDefault(t => t.Id == id));

    public static Task SaveAsync(Ticket t) => t.Title == "FAIL" ? throw new SampleUserFacingException("Save refused by the sample") : Task.CompletedTask;

    public static void Delete(string id) => _all.RemoveAll(t => t.Id == id);
}
