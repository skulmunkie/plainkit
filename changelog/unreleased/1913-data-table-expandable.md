---
type: added
issue: 1913
---
`pk-data-table` takes `expandable`, `expander` and `expanded` (the same as `pk-table`), shows `detail-<rowId>` children under their row and passes `pk-row-expand` on; expanding a row is not a row click. `pk-list-page` forwards `expandable`, `expander` and `expanded` from its `config` and the `detail-<rowId>` children too.
