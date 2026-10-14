---
type: fixed
issue: 1324
---
The scorecard module disconnects its four performance observers when it is left, so opening and leaving it no longer accumulates observers (`watchVitals` returns a non-enumerable `stop()`).
