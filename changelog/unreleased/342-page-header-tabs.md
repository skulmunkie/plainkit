---
type: added
issue: 342
---
`pk-page-header` draws its docked tab strip from data: `tabs` (an array of `{ value, label, count?, visible? }`, Blazor `PkPageHeader.TabItems`) and `tabs-from` (`always`, `phone`, `tablet`) say where the strip shows; a `pk-tabs` in the `tabs` slot still wins. This completes the page-level tabs set of #342.
