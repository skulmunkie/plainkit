---
type: fixed
issue: 1598
---
`PkRecordPage` / `pk-record-page` keep the typed values when a Save is rejected: a redraw of the form while edits are unsaved (the host re-rendering after the failure) starts from the live values instead of the blank ones.
