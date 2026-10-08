---
type: added
issue: 865
---
`PkTable` has a `SelectPageOnly` parameter (the element's `select-page-only`): the header checkbox selects the loaded page and "Select all N rows" is never offered, for a list whose bulk action works only on explicit ids. `PkDataTable` already had it.
