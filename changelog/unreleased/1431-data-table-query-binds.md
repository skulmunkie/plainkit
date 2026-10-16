---
type: added
issue: 1431
---
PkDataTable binds `SortKey`, `Descending`, `Search` and `PageSize` two-way (`@bind-SortKey`, `@bind-Descending`, `@bind-Search`, `@bind-PageSize`): they follow the reader's sort, search and page size through the element's `pk-query-change` event.
