namespace PlainKit.Blazor;

/// <summary>
/// The busy state of the pages of one circuit (or browser app) that the pk-app-frame busy overlay draws (#1545). A <see cref="PageBase"/> and a
/// <see cref="PkRecordEditor{TRecord, TForm, TKey}"/> report into it while they hold a busy token; the overlay needs no binding on any page.
/// </summary>
public sealed class PkBusyState
{
    private readonly object _gate = new();
    private readonly List<(object Owner, string? Label)> _holders = [];

    /// <summary>Raised when <see cref="IsBusy"/> or <see cref="Label"/> changed. May run on any thread: a subscriber marshals through its dispatcher.</summary>
    public event Action? Changed;

    /// <summary>True while any owner is busy.</summary>
    public bool IsBusy { get; private set; }

    /// <summary>The label of the owner that went busy (or changed its label) last; once idle, the last one shown, so a fading overlay keeps its text.</summary>
    public string? Label { get; private set; }

    /// <summary>Records that <paramref name="owner"/> is busy (with <paramref name="label"/>) or no longer is. Idempotent per owner.</summary>
    public void Set(object owner, bool busy, string? label = null)
    {
        lock (_gate)
        {
            var had = _holders.FindIndex(h => ReferenceEquals(h.Owner, owner));
            if (had >= 0 && _holders[had].Label == label && busy) return;
            if (had >= 0) _holders.RemoveAt(had);
            else if (!busy) return;
            if (busy) _holders.Add((owner, label));
            var (now, text) = (_holders.Count > 0, _holders.Count > 0 ? _holders[^1].Label : Label);
            if (now == IsBusy && text == Label) return;
            (IsBusy, Label) = (now, text);
        }
        Changed?.Invoke();
    }
}
