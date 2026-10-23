---
type: added
issue: 1714
---
Blazor Server reconnect UI, phase 1 of #1714: `js/reconnect.js`, the pure reconnect policy (state machine over the framework's `components-reconnect-state-changed` states, a visible countdown before an automatic reload, probe with exponential backoff and a three-reloads-per-minute loop guard), with node tests, and the design spec now records the reconnect behaviour measured on .NET 8, 9 and 10. Nothing renders yet; the `PkReconnect` component follows in phase 2.
