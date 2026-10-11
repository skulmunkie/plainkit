---
type: added
issue: 1022
---
Blazor `PkComponentBase` gives a component that is not a page the page lifecycle: `OnLoadAsync`, `IsLoading`, `LoadError`, `LoadCancellation`, `InvokeStateChanged` and `OnDisposeAsync`, plus `RunAsync` with a counted `IsBusy`. `PkRecordEditor` runs on the same lifecycle: a later `LoadAsync` supersedes an earlier one (a stale result is never applied), and it is `IDisposable` to cancel a load in flight.
