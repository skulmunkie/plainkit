---
type: added
issue: 801
---
`pk-table` has a selection scope for paged lists: `total` (rows matching the query across all pages) makes the bulk bar offer a "Select all N rows" button once the loaded rows are selected, `selectScope` (`page` or `all`) says which is meant, and the new `pk-select-all` event carries `{ scope, count }` without ids so the host expands "all" by asking its data source again. A `manual` table now keeps the ids of other pages when its rows are replaced by paging, search or sort. Blazor `PkTable` gets `SelectAllTotal`, `SelectScope` and `OnSelectAll`.
