---
type: added
issue: 798
---
`PkDataTable` can select rows: `Selectable`, `Selected` (two-way) and `OnSelect` keep the ids across paging and search, and selecting a full page offers "Select all 112", which raises `OnSelect` with `Scope` `all` and the query to run the bulk action against (no ids of other pages are sent).
