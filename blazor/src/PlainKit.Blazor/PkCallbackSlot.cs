using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>What JavaScript calls when a page element runs a callback property (<c>run</c>, <c>save</c>): the element's values in, an optional result out.</summary>
internal sealed class PkCallbackHost(Func<IReadOnlyDictionary<string, JsonElement>, Task<object?>> call)
{
    /// <summary>The values the element holds, keyed by field key.</summary>
    [JSInvokable]
    public Task<object?> Invoke(Dictionary<string, JsonElement> values) => call(values);
}

/// <summary>
/// One callback property of a page element (for example <c>run</c> on <c>pk-tool-page</c>), set from script because config is data and a callback is
/// not (STANDARDS.md). Set while the component has a delegate, cleared when it has none, and the .NET reference released on dispose.
/// </summary>
internal sealed class PkCallbackSlot(string name) : IDisposable
{
    private DotNetObjectReference<PkCallbackHost>? _ref;

    /// <summary>Makes the element's property <c>name</c> call <paramref name="call"/> while <paramref name="wanted"/>, and removes it otherwise.</summary>
    public async Task SyncAsync(IJSObjectReference bridge, ElementReference element, bool wanted, Func<IReadOnlyDictionary<string, JsonElement>, Task<object?>> call)
    {
        if (wanted == (_ref is not null)) return;
        if (wanted)
        {
            _ref = DotNetObjectReference.Create(new PkCallbackHost(call));
            await bridge.InvokeVoidAsync("setCallback", element, name, _ref);
        }
        else
        {
            Dispose();
            await bridge.InvokeVoidAsync("setCallback", element, name, null);
        }
    }

    public void Dispose()
    {
        _ref?.Dispose();
        _ref = null;
    }
}
