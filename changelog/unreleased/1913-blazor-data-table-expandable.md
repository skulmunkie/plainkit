---
type: added
issue: 1913
---
`PkDataTable<TItem>` and `PkListPage<TItem>` take `Expandable`, `Expander`, `Expanded`, `DetailTemplate`, `DetailPanels` and `OnRowExpand`, with the meaning they have on `PkTable<TItem>` (`PkDataTable` also has `@bind-Expanded`; `PkListPage` takes `Expanded` as the initial value). The detail is rendered for the loaded page's rows, and expanding a row is not a row click. In bUnit, `ExpandRowAsync(id)` on `PkDataTable` expands a row.
