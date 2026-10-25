---
type: added
issue: 431
---
The SVG toolkit gives `pk-canvas` its snap targets (`js/svg/snap.js`, pure): `snapTargets(doc, { exclude })` lists every shape not being moved, inside groups too, as a world rect `{ id, x, y, w, h }`, with the page first, in one pass over the document.
