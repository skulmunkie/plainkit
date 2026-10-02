---
type: added
issue: 830
---
Blazor: the AbortSignal an element passes to a callback property (`load(query, { signal })` on `pk-data-table`) now reaches .NET as a `CancellationToken`, so a superseded request, or one still running when the element leaves the page, is cancelled on the server. This holds for every callback slot; `PkDataTable.Load` already received the token in `PkListRequest.CancellationToken`.
