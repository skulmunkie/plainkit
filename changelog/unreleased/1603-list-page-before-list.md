---
type: added
issue: 1603
---
`pk-list-page` has a `before-list` slot between its title bar and the list (`PkListPage` `BeforeListContent`) for a status alert or a summary card. It scrolls with the page and does not shrink, so with `stickyHeader` the column header and pager stay pinned.
