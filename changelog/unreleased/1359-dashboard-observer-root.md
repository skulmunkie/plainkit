---
type: fixed
issue: 1359
---
A dashboard inside a scrolling container (the app frame's content area) now starts its widgets 200px before they scroll into view, as it does on a scrolling page: the lazy-start observer is rooted at the nearest scrolling ancestor instead of the viewport.
