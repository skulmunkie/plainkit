using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>What JavaScript calls when a page element runs a callback property: the one argument the element passes (its values for <c>run</c> and <c>save</c>, a query for <c>load</c>) in, an optional result out.</summary>
/// <typeparam name="TArg">What the element passes, deserialised from JSON.</typeparam>
internal sealed class PkCallbackHost<TArg>(Func<TArg, Task<object?>> call)
{
    /// <summary>The argument the element passed.</summary>
    [JSInvokable]
    public Task<object?> Invoke(TArg argument) => call(argument);
}

/// <summary>
/// One callback property of a page element (for example <c>run</c> on <c>pk-tool-page</c>), set from script because config is data and a callback is
/// not (STANDARDS.md). Set while the component has a delegate, cleared when it has none, and the .NET reference released on dispose.
/// </summary>
internal sealed class PkCallbackSlot(string name) : IDisposable
{
    private IDisposable? _ref;

    /// <summary>Makes the element's property <c>name</c> call <paramref name="call"/> while <paramref name="wanted"/>, and removes it otherwise. <paramref name="refresh"/> asks the element to redraw once the callback is set (a list that already showed its empty state).</summary>
    public async Task SyncAsync<TArg>(IJSObjectReference bridge, ElementReference element, bool wanted, Func<TArg, Task<object?>> call, bool refresh = false)
    {
        if (wanted == (_ref is not null)) return;
        if (wanted)
        {
            var reference = DotNetObjectReference.Create(new PkCallbackHost<TArg>(call));
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
        _ref?.Dispose();
        _ref = null;
    }
}
