---
type: added
issue: 352
---
`pk-list-page` adds a filterable, sortable, paginated list page type (a composed pk-table, pk-table-filters and pk-pagination): give it `columns`, `filters`, `actions`, `rowHref` and `empty` in `config`, and a `load(query)` callback that returns the rows for the current page. The app framework's `list` page type (`page: 'list'`) builds one from a module route.
