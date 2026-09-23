---
type: added
issue: 203
---
New `pk-table-filters` element: a debounced global search box plus a Filters trigger (with an active-filter-count badge) that opens a panel around your own filter fields, so a table's toolbar gets consistent search/filter UI without every page rebuilding the trigger-button-plus-badge-plus-panel shell by hand. Slot your own filter fields into the default slot; put the element in `pk-table`'s `toolbar` slot. It raises `pk-search`, `pk-toggle` and `pk-clear-filters`; it never searches, filters or clears anything itself. `PkTableFilters` is the generated Blazor component.
