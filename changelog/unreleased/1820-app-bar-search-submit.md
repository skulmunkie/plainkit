---
type: added
issue: 1820
---
`pk-app-bar-search` raises `pk-submit` `{ query }` when Enter is pressed with a non-empty query and no result highlighted (`OnSubmit` on `PkAppBarSearch`), so a host can show a full results page; the element still never navigates.
