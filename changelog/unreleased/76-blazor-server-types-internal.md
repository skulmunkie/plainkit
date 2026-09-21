---
type: breaking
issue: 76
---
`PkCircuitState` no longer derives from `CircuitHandler` (an internal handler updates it, and the dev tools read it as before), and the `PkSourceProvider` constructor takes an `IServiceProvider?` instead of an `IHostEnvironment?`, so neither names a server-only type.
