---
type: breaking
issue: 881
---
`PkDataList<TItem>` is removed (it was an `[Obsolete]` alias of `PkDataTable<TItem>`): rename it to `PkDataTable`, `CurrentId` to `CurrentRow`, and replace `LoadAllIds` with the query that `OnSelect` carries when the scope is all.
