---
type: changed
issue: 380
---
`PageBase` reads time through a new protected virtual `Clock` (a `TimeProvider`, `TimeProvider.System` by default, so behaviour is unchanged); a test overrides it to drive the busy overlay delay and minimum time deterministically.
