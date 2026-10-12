---
type: added
issue: 1209
---
`PageBase.TryBusyAsync(action, label)` runs an event-handler action under busy, log and danger status like `BusyAsync` but does not rethrow, and returns whether it succeeded; `protected virtual DescribeError(Exception)` words the status text (override it to walk inner exceptions).
