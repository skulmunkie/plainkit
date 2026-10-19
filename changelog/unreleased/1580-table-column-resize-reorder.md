---
type: added
issue: 1580
---
`pk-table` columns can be resized and reordered: `resizable` gives each header a separator handle (drag it, or focus it and press Left or Right) and `reorderable` lets a header be dragged (touch: press and hold) or moved with Alt+Left or Alt+Right. `pk-column-resize` reports the width and the cancelable `pk-column-reorder` the new order; the layout stays when the host sets `columns` or `rows` again, and it works with windowing and a sticky header. The code loads only for a table that sets either property. Blazor: `Resizable`, `Reorderable`, `OnColumnResize` and `OnColumnReorder` on `PkTable`.
