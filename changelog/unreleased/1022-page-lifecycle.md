---
type: changed
issue: 1022
---
The `list` and `record` page types run their load, save, delete and bulk callbacks through one tested page lifecycle: a newer load aborts the older one (the load callback receives an `AbortSignal` as a last argument), the page shows busy while a save or delete runs, and leaving the page aborts and silences work in flight.
