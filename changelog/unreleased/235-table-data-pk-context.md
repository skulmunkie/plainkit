---
type: added
issue: 235
---
`pk-table` marks each data-driven row with `data-pk-context="<rowId>"`, so wrapping the whole table in a `pk-context-menu` can serve different menu content per row (the row's id arrives as the `context` field of `pk-open`'s detail). The previous internal `data-id` row attribute is now `data-pk-context`.
