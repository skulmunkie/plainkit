---
type: added
issue: 431
---
The SVG toolkit starts with its pure model (`js/svg/`, no element yet): a vector document of rectangles, ellipses, lines, polylines, polygons, paths, text and groups, a single allow-list of what may exist, 6-number transform matrices, ids that are never reused, hard limits, and a JSON round trip that cleans any input and reports what it dropped. It is lazily importable and not part of any element or the app entry.
