using System.Text.Json;
using System.Text.Json.Serialization;

namespace PlainKit.Blazor;

/// <summary>When <see cref="PkReconnect"/> reloads the page by itself.</summary>
public enum PkReconnectAutoReload
{
    /// <summary>Never: the person presses Reload.</summary>
    Never,
    /// <summary>When the circuit is gone (the server restarted or dropped it): after a visible countdown with a Cancel button. The default.</summary>
    Gone,
    /// <summary>Also after a long outage: probes the server with growing pauses and reloads as soon as it answers.</summary>
    Always,
}

/// <summary>The words <see cref="PkReconnect"/> shows. A null member keeps the English default; <c>{0}</c> in <see cref="AttemptLabel"/> and <see cref="ReloadIn"/> is the number.</summary>
public sealed class PkReconnectStrings
{
    public string? Busy { get; set; }
    public string? AttemptLabel { get; set; }
    public string? Failed { get; set; }
    public string? StillTrying { get; set; }
    public string? Ended { get; set; }
    public string? ReloadIn { get; set; }
    public string? Paused { get; set; }
    public string? Blocked { get; set; }
    public string? TryNow { get; set; }
    public string? Reload { get; set; }
    public string? Cancel { get; set; }
    public string? Resume { get; set; }
}

/// <summary>How <see cref="PkReconnect"/> behaves. Set <see cref="PkOptions.Reconnect"/> to turn the reconnect banner on for <c>PkApp</c>; the policy itself is plainkit/js/reconnect.js.</summary>
public sealed class PkReconnectOptions
{
    /// <summary>When to reload by itself. Default <see cref="PkReconnectAutoReload.Gone"/>.</summary>
    public PkReconnectAutoReload AutoReload { get; set; } = PkReconnectAutoReload.Gone;

    /// <summary>Block the page behind the banner (everything else becomes inert) instead of a banner the person can ignore. Default false.</summary>
    public bool Modal { get; set; }

    /// <summary>Seconds of the visible countdown before an automatic reload. Default 5.</summary>
    public int CountdownSeconds { get; set; } = 5;

    /// <summary>The same-origin URL probed (HEAD) while the server is unreachable and <see cref="AutoReload"/> is <see cref="PkReconnectAutoReload.Always"/>. Default <c>/</c>.</summary>
    public string ProbeUrl { get; set; } = "/";

    /// <summary>The words shown; set the ones you translate.</summary>
    public PkReconnectStrings Strings { get; set; } = new();

    internal string ToJson() => JsonSerializer.Serialize(new { autoReload = AutoReload.ToString().ToLowerInvariant(), modal = Modal, countdown = CountdownSeconds, probeUrl = ProbeUrl, strings = Strings },
        new JsonSerializerOptions(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull });
}
