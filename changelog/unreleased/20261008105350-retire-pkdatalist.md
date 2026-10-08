---
type: breaking
---
`PkDataList<TItem>` is removed (it was an `[Obsolete]` alias of `PkDataTable<TItem>` in 0.11.0): rename it to `PkDataTable`, `CurrentId` to `CurrentRow`, and replace `LoadAllIds` with the query that `OnSelect` carries when the scope is all.
