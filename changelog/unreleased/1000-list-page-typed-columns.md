---
type: added
issue: 1000
---
`PkListPage<TItem>` takes typed `Columns` (`PkTableColumn<TItem>`, as `PkDataTable` does): they replace the columns of `Config`, and a column's `Cell` template fills that cell of every loaded row.
