---
type: added
issue: 342
---
`pk-record-form` takes its tabs as data: `tabs` is an array of `{ value, label, count?, visible? }` and the element draws the strip, with `count` as the badge after the label and `visible: false` leaving a tab out (a chosen tab that went falls back to the first). Sections tag themselves with `tab="value"` as before; a `pk-tabs` in the `tabs` slot still wins. Blazor: `TabItems` (a list of `PkRecordTab`).
