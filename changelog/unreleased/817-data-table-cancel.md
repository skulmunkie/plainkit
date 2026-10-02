---
type: added
issue: 817
---
`pk-data-table` passes `load(query, { signal })` an `AbortSignal` that aborts when a newer request replaces the one in flight or the element leaves the page; the aborted request shows no error.
