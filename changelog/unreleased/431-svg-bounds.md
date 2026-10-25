---
type: added
issue: 431
---
The SVG toolkit can measure its documents (`js/svg/bounds.js`, pure, no element yet): `worldBounds(doc, id)` gives a node's box in document space, exact for every shape under any transform (rotated rectangles and ellipses, curve extrema of paths, groups as the union through their matrices), `orientedBox` its corners when turned, and `selectionBounds` the box around several nodes. Text is estimated unless you pass a measuring callback.
