using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>What JavaScript calls when a page element runs a callback property: the one argument the element passes (its values for <c>run</c> and <c>save</c>, a query for <c>load</c>) in, an optional result out. A call the element can abort carries an id: <c>Cancel</c> cancels the token that call was given.</summary>
/// <typeparam name="TArg">What the element passes, deserialised from JSON.</typeparam>
internal sealed class PkCallbackHost<TArg>(Func<TArg, CancellationToken, Task<object?>> call)
{
    private readonly Dictionary<int, CancellationTokenSource> _calls = [];
    private int _anonymous;

    /// <summary>The argument the element passed, and the id of the call (0: the element cannot abort it).</summary>
    [JSInvokable]
    public async Task<object?> Invoke(TArg argument, int callId = 0)
    {
        using var cancel = new CancellationTokenSource();
        lock (_calls) callId = callId != 0 ? callId : -(++_anonymous);   // every call is tracked, so CancelAll reaches it
        lock (_calls) _calls[callId] = cancel;
        try { return await call(argument, cancel.Token); }
        finally { lock (_calls) _calls.Remove(callId); }
    }

    /// <summary>The element's abort signal fired for call <paramref name="callId"/> (a call that already finished is ignored).</summary>
    [JSInvokable]
    public void Cancel(int callId)
    {
        lock (_calls) if (_calls.TryGetValue(callId, out var cancel)) cancel.Cancel();
    }

    /// <summary>Cancels every call in flight (the component was disposed).</summary>
    public void CancelAll()
    {
        lock (_calls) foreach (var cancel in _calls.Values) cancel.Cancel();
    }
}

/// <summary>
/// One callback property of a page element (for example <c>run</c> on <c>pk-tool-page</c>), set from script because config is data and a callback is
/// not (STANDARDS.md). Set while the component has a delegate, cleared when it has none, and the .NET reference released on dispose.
/// </summary>
internal sealed class PkCallbackSlot(string name) : IDisposable
{
    private IDisposable? _ref;
    private Action? _cancelAll;

    /// <summary>Makes the element's property <c>name</c> call <paramref name="call"/> while <paramref name="wanted"/>, and removes it otherwise. <paramref name="refresh"/> asks the element to redraw once the callback is set (a list that already showed its empty state).</summary>
    public Task SyncAsync<TArg>(IJSObjectReference bridge, ElementReference element, bool wanted, Func<TArg, Task<object?>> call, bool refresh = false) =>
        SyncAsync<TArg>(bridge, element, wanted, (arg, _) => call(arg), refresh);

    /// <summary>As above, for a callback that takes the <see cref="CancellationToken"/> of the element's abort signal (cancelled when the element aborts the call, and on dispose).</summary>
    public async Task SyncAsync<TArg>(IJSObjectReference bridge, ElementReference element, bool wanted, Func<TArg, CancellationToken, Task<object?>> call, bool refresh = false)
    {
        if (wanted == (_ref is not null)) return;
        if (wanted)
        {
            var host = new PkCallbackHost<TArg>(call);
            _cancelAll = host.CancelAll;
            var reference = DotNetObjectReference.Create(host);
            _ref = reference;
            await bridge.InvokeVoidAsync("setCallback", element, name, reference, refresh);
        }
        else
        {
            Dispose();
            await bridge.InvokeVoidAsync("setCallback", element, name, null, false);
        }
    }

    public void Dispose()
    {
        _cancelAll?.Invoke();
        _cancelAll = null;
        _ref?.Dispose();
        _ref = null;
    }
}
