---
type: added
issue: 429
---
pk-property-grid can be updated in place: `setValue(key, value)`, a `state` property (per-property disabled/hidden) and `visibleWhen` change one property without rebuilding, so focus, scroll and open groups stay. It gains `range` (slider) and `color` (hex with swatch) editors, and shows label beside value once the grid is 480px wide; every label now uses the same pk-field style.
