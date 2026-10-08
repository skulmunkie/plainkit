---
type: breaking
issue: 682
---
`pk-loading-overlay` owns the busy timing rule: `delay` (ms busy must last before the overlay appears) and `min-time` (ms it stays once shown), both default 0. `createPage` hands its delay (150) and minimum time (300) to the overlay instead of running its own timers. Blazor: `PageBase` keeps only the busy count and label; `ShowBusyOverlay`, `BusyDelay`, `BusyMinTime` and `Clock` are gone. Bind `<PkLoadingOverlay Busy="@IsBusy" Delay="150" MinTime="300" Label="@BusyLabel">` instead of `Busy="@ShowBusyOverlay"`, and set `Delay` and `MinTime` there where you overrode the old members.
