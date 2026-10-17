---
type: added
issue: 1551
---
`pk-app-shell` has a `fill` option (`Fill` on `PkAppShell`): the page region becomes a definite-height flex column, so a `pk-list-page` with `sticky-header` keeps its column header and pager in view while only the rows scroll; an ordinary page in the same shell still scrolls, its page header pinned.
