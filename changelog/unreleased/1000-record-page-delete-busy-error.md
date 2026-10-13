---
type: added
issue: 1000
---
`pk-record-page` has `deletable`, `busy` and `error` properties (a Delete button, every button waiting while the host works, and a host error notice above the record), and Blazor's `PkRecordPage` gets `OnDelete`, `Busy` and `Error` to bind a `PageBase` page's `IsBusy` and `StatusMessage` (typed model and edit-mode editor follow in later steps of #1000).
