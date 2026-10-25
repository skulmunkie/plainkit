---
type: added
issue: 431
---
The SVG toolkit gains shape generators (`js/svg/shapes.js`, pure, no element yet): `regularPolygon`, `star`, `roundedRect`, `arc` (open, pie or full circle, as exact cubic pieces) and `grid` (the lines of a cutting or layout grid) return node specs that go straight into `ops.insert`; input that cannot make the shape gives null.
