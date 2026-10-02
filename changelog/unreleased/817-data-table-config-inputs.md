---
type: added
issue: 817
---
`pk-data-table` config takes `pageSizeOptions`, an initial `sort` and `sortDir`, `searchable`, `searchLabel`, `searchDebounce`, `pagerLabel`, `label` and `caption`, passed to its search box, pager and table; a config that arrives after the first draw still sets the initial page size and sort.
