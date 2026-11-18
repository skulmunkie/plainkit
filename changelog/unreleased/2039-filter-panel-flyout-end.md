---
type: added
issue: 2039
---
`pk-data-table` and `pk-list-page` take `filterPanel="flyout-end"` (Blazor `PkFilterPanel.FlyoutEnd`, `pk-table-filters` `placement="end"`): the open filter panel flies out from the inline-end edge of the table area, scrolling its body when it overflows, with the toolbar actions staying on the toolbar row; it mirrors in right to left.
