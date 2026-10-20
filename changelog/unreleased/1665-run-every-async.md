---
type: added
issue: 1665
---
`PkComponentBase.RunEveryAsync(period, tick)` repeats a component's work on a timer: it re-renders after each tick, never overlaps a slow tick, logs a failing tick and keeps going, and stops when the component or the returned handle is disposed. The timer is the new `js/tick.js` (`every(ms, fn, { signal })`), so the Blazor side keeps no timer or cancellation source of its own.
