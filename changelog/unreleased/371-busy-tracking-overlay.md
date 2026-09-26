---
type: added
issue: 371
---
`createPage` (js/page.js) counts busy actions and owns its loading overlay: `page.isBusy`, `page.busyLabel`, `page.begin(label)` (returns an idempotent `end()`), `page.onBusyChange(fn)` (returns its unsubscribe), and the options `body` (the page body the page wraps in a `pk-loading-overlay` it creates, so a page writes no overlay markup), `fullscreen` (app scope), `delay` and `minTime` (the overlay appears after `BUSY_DELAY`, 150 ms, and stays `BUSY_MIN_TIME`, 300 ms; both exported). The busy region gets `aria-busy`; `destroy()` releases every token and timer. An `overlay` element you placed yourself still works, driven at once. Blazor `PageBase` gets the same counted semantics: `BeginBusy`, `ShowBusyOverlay` (bind `PkLoadingOverlay Busy` to it), `BusyDelay`, `BusyMinTime` and `ReleaseBusy`.
