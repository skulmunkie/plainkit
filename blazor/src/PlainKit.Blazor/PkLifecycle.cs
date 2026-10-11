namespace PlainKit.Blazor;

/// <summary>
/// The page lifecycle rules (#1022), the C# half of <c>core/js/page-lifecycle.js</c>; <c>core/tests/fixtures/page-lifecycle.json</c> is read by both test suites so they cannot drift.
/// A load gets a fresh cancellation token and a generation: a later load cancels the earlier one and a superseded or disposed load never applies or reports. A cancelled call is never an error.
/// Counted busy tokens live here too. No timers.
/// </summary>
internal sealed class PkLifecycle : IDisposable
{
    private readonly Action _changed;
    private readonly CancellationTokenSource _root = new();
    private readonly CancellationTokenRegistration _external;
    private readonly List<Busy> _busy = [];
    private CancellationTokenSource? _load;
    private int _generation;
    private string? _lastLabel;

    public PkLifecycle(Action changed, CancellationToken external = default)
    {
        _changed = changed;
        _external = external.Register(Dispose);
    }

    public bool Disposed { get; private set; }
    public string State { get; private set; } = "idle";
    public Exception? Error { get; private set; }
    public bool IsBusy => _busy.Count > 0;
    public string? BusyLabel => _busy.Count > 0 ? _busy[^1].Label : _lastLabel;
    public CancellationToken Token => _load?.Token ?? _root.Token;

    /// <summary>Reports loading before any await, so a first render never draws a default model.</summary>
    public void Expect()
    {
        if (!Disposed) State = "loading";
    }

    /// <summary>Runs <paramref name="load"/> now; the result reaches <paramref name="apply"/>, a failure <paramref name="fail"/>, only while this is still the current load.</summary>
    public async Task LoadAsync<T>(Func<CancellationToken, Task<T>> load, Action<T>? apply = null, Func<Exception, Task>? fail = null)
    {
        if (Disposed) return;
        var mine = ++_generation;
        _load?.Cancel();
        var own = _load = CancellationTokenSource.CreateLinkedTokenSource(_root.Token);
        State = "loading";
        Error = null;
        try
        {
            var data = await load(own.Token);
            if (mine != _generation || Disposed) return;
            State = "ready";
            apply?.Invoke(data);
        }
        catch (Exception e)
        {
            if (mine != _generation || Disposed || own.IsCancellationRequested || e is OperationCanceledException) return;
            State = "error";
            Error = e;
            if (fail is not null) await fail(e);
        }
    }

    /// <summary>Runs <paramref name="action"/> under a busy token. A failure sets <see cref="Error"/>, goes to <paramref name="fail"/> once and is rethrown; cancellation by disposal returns default.</summary>
    public async Task<T?> RunAsync<T>(string? label, Func<CancellationToken, Task<T>> action, Func<Exception, Task>? fail = null)
    {
        if (Disposed) return default;
        using var busy = Begin(label);
        try
        {
            return await action(_root.Token);
        }
        catch (OperationCanceledException) when (_root.IsCancellationRequested)
        {
            return default;
        }
        catch (Exception e)
        {
            if (!Disposed) Error = e;
            if (fail is not null) await fail(e);
            throw;
        }
    }

    public IDisposable Begin(string? label)
    {
        var token = new Busy(label, this);
        _busy.Add(token);
        _lastLabel = label;
        _changed();
        return token;
    }

    public void ReleaseBusy() => _busy.Clear();

    public void Dispose()
    {
        if (Disposed) return;
        Disposed = true;
        State = "idle";
        _generation++;
        _external.Dispose();
        _root.Cancel();
        _busy.Clear();
    }

    private sealed class Busy(string? label, PkLifecycle owner) : IDisposable
    {
        public string? Label { get; } = label;
        private PkLifecycle? _owner = owner;

        public void Dispose()
        {
            var o = _owner;
            _owner = null;
            if (o is null) return;
            if (o._busy.Remove(this) && o._busy.Count > 0) o._lastLabel = o._busy[^1].Label;
            o._changed();
        }
    }
}
