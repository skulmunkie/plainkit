---
type: added
issue: 1550
---
`PkListPage` has `ReloadAsync()` (loads the current page again, keeping search, sort, page and filters) and the parameters `InitialSearch`, `InitialFilters`, `InitialSortKey`, `InitialDescending` and `InitialPage` to start from a deep link; `pk-list-page` documents `refresh()` and takes `search`, `sort`, `sortDir`, `startPage` and `filterValues` in its config, and `pk-data-table` the props `startPage` and `filterValues`.
