---
type: added
issue: 431
---
The SVG toolkit can read and write path data (`js/svg/path.js` and `path-geom.js`, pure, no element yet): `parsePath` understands the whole `d` grammar (relative and absolute commands, smooth curves, quadratics, arcs, compact numbers and flags) and turns it into the model's absolute move, line, cubic and close segments, keeping what came before an error and reporting where; `toD` writes them back short and deterministic. Geometry on segments: exact bounds, transform, reverse, flatten, length, point-at, simplify.
