using Microsoft.JSInterop;

namespace PlainKit.Blazor;

public abstract partial class PkElementBase
{
    /// <summary>Calls one of the element's own methods (show, focus, refresh, ...) and waits for it; the generated <c>ShowAsync</c>-style methods use it. A name the element lacks does nothing; before the element is defined the call waits for it.</summary>
    public async Task CallAsync(string method, params object?[] args) => await (await Runtime.BridgeAsync(Assets)).InvokeVoidAsync("call", Element, method, args);

    /// <inheritdoc cref="CallAsync(string, object?[])"/>
    public async Task<T> CallAsync<T>(string method, params object?[] args) => await (await Runtime.BridgeAsync(Assets)).InvokeAsync<T>("call", Element, method, args);
}
