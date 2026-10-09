---
type: added
issue: 1018
---
`pk-design-surface` (`PkDesignSurface` in Blazor): a scrolling ground that frames the page an editor is working on at full, tablet or phone width, with an inert page, selection, drop-target, hidden and empty marks drawn as overlay boxes around the page nodes, an action chip (slot `chip`) placed beside a node and kept inside the surface, and the events `pk-surface-pick`, `pk-surface-hover` and `pk-surface-key`. `reveal(node)` scrolls a node into view. The layout builder adopts it in a later step.
