---
type: added
issue: 1550
---
`pk-list-page` has a `refresh()` method and `config.filterValues` and `config.page` beside `search`, `sort` and `sortDir` to seed its first query; `pk-data-table` gets the `filterValues` and `page` props, so a seeded filter shows in the filter panel. In Blazor, `PkListPage` gets `ReloadAsync()` and `InitialSearch`, `InitialFilters`, `InitialSortKey`, `InitialDescending` and `InitialPage`.
