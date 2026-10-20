---
type: added
issue: 1685
---
`PkTable` has `DetailPanels` (a dictionary of `RenderFragment<TItem>` by panel name): each named panel is drawn in the element's `detail-<rowId>.<name>` slot beside or instead of `DetailTemplate`, so a row can have several independent sub-rows. The host opens one by putting `"<rowId>.<name>"` in `Expanded` (set `Expander="none"` to drop the toggle column).
