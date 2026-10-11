---
type: fixed
issue: 1076
---
The gallery's first load is lighter and steadier on a slow connection: the source-tree `core/plainkit.css` is the one-file page layer (as `dist/plainkit.css` already is) instead of an eight-file `@import` chain, which saves eight serial round trips; and the overview header, tiles, grid and the side-nav rows keep their box until their elements upgrade, so nothing shifts. The security scanner no longer counts the generated `plainkit.css` (a concatenation of files it scans itself).
