namespace PlainKit.Blazor;

/// <summary>What a callback that threw hands the bridge (#1412): an <see cref="IPkUserFacingException"/> keeps its message, any other exception gets the generic line, and only its type name goes to the SDK log, never the element or the stack.</summary>
internal static class PkCallbackError
{
    public static object Of(Exception e) => new { pkError = true, message = e is IPkUserFacingException ? e.Message : "Something went wrong. See the log for details.", detail = e.GetType().FullName };
}
