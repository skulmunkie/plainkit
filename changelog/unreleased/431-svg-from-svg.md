---
type: added
issue: 431
---
The SVG toolkit can read SVG text (`fromSvg` in `js/svg/io.js`): it never throws, keeps only the allow-listed shapes and attributes, drops scripts, handlers, links, styles, DTDs and foreign namespaces (each one listed as a problem) and honours the size, depth and coordinate limits.
