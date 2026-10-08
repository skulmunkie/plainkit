---
type: added
issue: 336
---
`pk-list-group` has a `dense` attribute for long lists of results or an outline: rows at text height with their children laid out inline from the start, no 44px minimum on desktop (an actionable row keeps the touch target on a phone), a focus ring inside the row, and `data-depth="1"` to `"3"` on a row to indent it. Blazor: `<PkListGroup Dense="true">`.
