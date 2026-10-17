namespace PlainKit.Blazor;

public sealed partial class PkRecordEditor<TRecord, TForm, TKey>
{
    /// <summary>Optional: the page-level busy state (resolved from DI) a save or delete reports into, so the page is blocked while it runs (<see cref="PkApp"/>).</summary>
    public PkBusyState? PageBusy { get; init; }

    // One busy token that also reports to PageBusy; disposing it releases both.
    private IDisposable Hold(string verb)
    {
        var token = _life.Begin(verb);
        PageBusy?.Set(this, true, verb);
        return new Releaser(() => { token.Dispose(); PageBusy?.Set(this, false); });
    }

    private sealed class Releaser(Action release) : IDisposable
    {
        private Action? _release = release;
        public void Dispose() { _release?.Invoke(); _release = null; }
    }
}
