---
type: added
issue: 332
---
Dragging a `pk-kanban` card or a `pk-sortable` row near the top or bottom of the window (or of the nearest scrolling ancestor, such as the shell body) scrolls the page, faster the closer the pointer is to the edge, at a steady slow speed under `prefers-reduced-motion`, and the drop position follows the row under the pointer. The two elements share one auto-scroll module.
