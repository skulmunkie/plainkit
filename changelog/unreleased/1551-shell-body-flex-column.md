---
type: changed
issue: 1551
---
The `pk-app-shell` / `PkAppShell` body is now a flex column of definite height, so a page type that fills it (a list page with `stickyHeader`) keeps its header row and pager pinned and scrolls only its rows, instead of growing to its content height and scrolling the whole page. Ordinary pages are unchanged and still scroll. A host wrapper element between the body and the page needs `flex: 1 1 auto; min-height: 0` (or `display: contents`).
