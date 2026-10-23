---
type: added
issue: 1714
---
Blazor Server reconnect banner, phase 2 of #1714: `PkReconnect` (place it once in `App.razor`) or `PkOptions.Reconnect` (PkApp starts it) shows a themed `pk-alert` banner while the circuit reconnects, offers Retry now and Reload when the server cannot be reached, counts down visibly and reloads when the session ended after a server restart (with Cancel and a three-reloads-per-minute guard), and offers Resume when paused; options `AutoReload`, `CountdownSeconds`, `Modal`, `ProbeUrl` and translatable `Strings`.
