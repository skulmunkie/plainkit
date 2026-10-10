---
type: added
issue: 1000
---
Blazor `PkListPage<TItem>` takes `Cells` (a column key to a `RenderFragment<TItem>`) and `IdOf`, so a column renders your own markup per row; `pk-list-page` forwards the `cell-<id>-<key>` slots to its table. The generator gains a `cells` mapping kind.
