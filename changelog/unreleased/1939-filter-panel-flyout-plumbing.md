---
type: added
issue: 1939
---
`pk-data-table` and `pk-list-page` take `filterPanel` (`inline`, the default, or `flyout`), which sets the new `placement` on `pk-table-filters`; with `flyout` the open filter panel overlays the top of the table (22rem wide, `--pk-table-filters-w`) instead of pushing the rows down. The table sits in a new `area` part, and the panel parts are exported as `filters-panel` and `filters-body`. Escape handling and the phone sheet follow.
