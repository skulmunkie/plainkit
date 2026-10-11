---
type: added
issue: 1022
---
`plainkit audit` flags hand-rolled lifecycle plumbing: rule B7 for a Blazor component (`.razor` or `.cs`) that implements `IDisposable` with its own `CancellationTokenSource`, or keeps busy and error fields beside `OnInitializedAsync`, and rule P10 for a JS page factory with its own `AbortController`, busy flag and teardown. Both are warnings and point to `PageBase`/`PkComponentBase` and `createLifecycle`. The audit now reads `.cs` files.
