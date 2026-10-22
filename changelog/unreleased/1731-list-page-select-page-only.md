---
type: added
issue: 1731
---
`pk-list-page` forwards `config.selectPageOnly` to its data table: with `selectable`, the header checkbox selects the loaded page only and never offers "Select all N matching", so `pk-bulk` always carries scope `page`. Blazor: the `SelectPageOnly` parameter of `PkListPage`.
