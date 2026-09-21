namespace PlainKit.Blazor;

/// <summary>Where a Blazor Server circuit is.</summary>
public enum PkCircuitPhase
{
    /// <summary>No circuit event seen: prerendering, or not Blazor Server.</summary>
    None,
    /// <summary>The circuit exists and its first connection is coming up.</summary>
    Opened,
    /// <summary>The browser is connected.</summary>
    Connected,
    /// <summary>The connection dropped; the browser may reconnect.</summary>
    Disconnected,
    /// <summary>The circuit ended.</summary>
    Closed,
}

/// <summary>
/// A Blazor Server circuit's own lifecycle, from the framework's circuit events (the only source of real circuit state). Scoped, so each circuit has its own.
/// It is registered by <c>AddPlainKit</c> on Blazor Server and not in a browser (WebAssembly), where there is no circuit. A plain class on purpose: the
/// server-only <c>CircuitHandler</c> that fills it is internal (<c>PkCircuitHandler</c>), so this assembly can be loaded and scanned in a browser.
/// </summary>
public sealed class PkCircuitState
{
    /// <summary>Where the circuit is now.</summary>
    public PkCircuitPhase Phase { get; private set; }

    /// <summary>The circuit's id (not a secret), or null before it opened.</summary>
    public string? CircuitId { get; private set; }

    /// <summary>When the circuit opened.</summary>
    public DateTimeOffset? OpenedAt { get; private set; }

    /// <summary>When the connection last came up.</summary>
    public DateTimeOffset? ConnectedAt { get; private set; }

    /// <summary>When the connection last dropped.</summary>
    public DateTimeOffset? DisconnectedAt { get; private set; }

    /// <summary>How many times the connection dropped.</summary>
    public int Disconnects { get; private set; }

    /// <summary>How many times it came back after a drop.</summary>
    public int Reconnects { get; private set; }

    internal void Opened(string id)
    {
        CircuitId = id;
        OpenedAt = DateTimeOffset.UtcNow;
        Phase = PkCircuitPhase.Opened;
    }

    internal void ConnectionUp()
    {
        if (Disconnects > 0) Reconnects++;
        ConnectedAt = DateTimeOffset.UtcNow;
        Phase = PkCircuitPhase.Connected;
    }

    internal void ConnectionDown()
    {
        Disconnects++;
        DisconnectedAt = DateTimeOffset.UtcNow;
        Phase = PkCircuitPhase.Disconnected;
    }

    internal void Closed() => Phase = PkCircuitPhase.Closed;
}
