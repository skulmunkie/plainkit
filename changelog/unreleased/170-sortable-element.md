---
type: added
issue: 170
---
New `pk-sortable` and `pk-sortable-item` elements: a pointer, touch and keyboard reorder list. Drag a row's 44px handle, or focus a row and press Alt+Up/Alt+Down; a `pk-reorder` event carries the new order, and a live region announces it. `pk-sortable` can also accept a row dragged in from outside it (an `accept-external` list, driven by `beginExternalDrag`/`externalDragOver`/`endExternalDrag`), for a palette-to-canvas drop.
