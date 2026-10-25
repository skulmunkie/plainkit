---
type: added
issue: 430
---
A selectable `pk-canvas` snaps a dragged selection: `snap="grid guides edges centres"` (any of them) pulls it within `snap-threshold` screen pixels (default 6) onto the grid, the `guides` (`[{ axis, at }]` in world units, drawn as dashed lines), or the edges and centres of the other items and of the JS-only `targets` rects, and shows the line that holds it while dragging. Blazor: `Snap`, `SnapThreshold`, `Guides`.
