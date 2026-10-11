---
type: breaking
issue: 1022
---
Blazor `PageBase` gains a load lifecycle: `OnLoadAsync(CancellationToken)` runs on first render and when a parameter changes (opt out with `ReloadOnParameters => false`), `IsLoading`, `LoadError`, `LoadCancellation` (cancelled on the next load and on dispose), a safe `InvokeStateChanged()` and `OnDisposeAsync()`. Its busy bookkeeping moves to an internal `PkLifecycle` that shares `core/tests/fixtures/page-lifecycle.json` with the JS helper. Breaking: `PageBase` now implements `IAsyncDisposable` instead of `IDisposable`. Migration: a page that cast the base to `IDisposable` or declared its own `Dispose` through the interface moves that work into `OnDisposeAsync()`; a page that merely calls `ReleaseBusy()` or `BusyAsync` needs no change.
