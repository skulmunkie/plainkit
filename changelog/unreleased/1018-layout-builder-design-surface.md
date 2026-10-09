---
type: changed
issue: 1018
---
The layout builder's canvas is now a `pk-design-surface`: the page sits on its own panel inside the grey ground, the selection, hidden, empty and drop-target marks are drawn by the surface, and the Edit/Delete chip sits at the top-right corner of the hovered or selected element (above it, or inside its top edge when there is no room above). The unused `--lb-border-w`, `--lb-focus-offset`, `--lb-phone-w`, `--lb-tablet-w`, `--lb-empty-offset`, `--lb-mark-w`, `--lb-mark-offset` and `--lb-node-controls-z` tokens are removed.
