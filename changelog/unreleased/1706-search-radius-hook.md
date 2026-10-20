---
type: changed
issue: 1706
---
The `pk-table-filters` search box and Filters trigger and the `pk-app-bar-search` field now default to the control radius like buttons and inputs, instead of a pill. New hooks `--pk-table-filters-radius` and `--pk-app-bar-search-radius` (default `var(--pk-control-radius, var(--radius-sm))`) let a theme restore a pill with `var(--radius-pill)`.
