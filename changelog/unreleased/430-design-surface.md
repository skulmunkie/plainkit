---
type: added
issue: 430
---
`pk-design-surface` (`PkDesignSurface` in Blazor): a pan and zoom ground for design tools. Drag, scroll or pinch to pan, Ctrl and the wheel, pinch, the toolbar or the keys `+`, `-` and `0` to zoom, an optional `grid`, a coordinate API (`pointToWorld`, snapped to the grid, and `worldToPoint`), selection frames around descendants flagged `data-surface-selected`, and the events `pk-view-change`, `pk-surface-pick` and `pk-surface-key`. First step of the canvas: guides, snapping while dragging and the layout builder's adoption follow. A `minus` icon joins the set.
