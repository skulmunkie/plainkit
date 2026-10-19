using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

namespace PlainKit.Blazor;

/// <summary>What a callback that threw hands the bridge (#1412): an <see cref="IPkUserFacingException"/> keeps its message, any other exception gets the generic line and only its type name, and the full exception goes to <see cref="ILogger"/> on the server, never to the browser.</summary>
internal static class PkCallbackError
{
    public static object Of(Exception e, ILogger? log, Func<Exception, bool>? userFacing = null)
    {
        var user = e is IPkUserFacingException || Decides(e, userFacing, log);
        log?.Log(user ? LogLevel.Information : LogLevel.Error, e, "A page callback raised {ExceptionType}", e.GetType().Name);
        return new { pkError = true, message = user ? e.Message : "Something went wrong. See the log for details.", detail = e.GetType().FullName };
    }
    private static bool Decides(Exception e, Func<Exception, bool>? p, ILogger? log) { /* the app's IsUserFacing: a throw is logged and counts as false */ try { return p?.Invoke(e) == true; } catch (Exception x) { log?.LogWarning(x, "IsUserFacing threw"); return false; } }
}
/// <summary>The bridge module reference, carrying the logger the callback slots use for <see cref="PkCallbackError"/>.</summary>
internal sealed class PkLoggedBridge(IJSObjectReference inner, ILogger? log) : IJSObjectReference
{
    public ILogger? Log => log;
    public ValueTask<T> InvokeAsync<T>(string identifier, object?[]? args) => inner.InvokeAsync<T>(identifier, args);
    public ValueTask<T> InvokeAsync<T>(string identifier, CancellationToken cancellationToken, object?[]? args) => inner.InvokeAsync<T>(identifier, cancellationToken, args);
    public ValueTask DisposeAsync() => inner.DisposeAsync();
}
