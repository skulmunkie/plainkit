---
type: added
issue: 1006
---
pk-data-table (PkDataTable) and the list page (PkListPage, `stickyHeader` in its config) now fill a flex column of definite height: with `stickyHeader` the column header stays pinned, only the rows scroll, and the pager and bulk bar stay in view below them, with no `maxHeight` to guess, at desktop and phone widths.
