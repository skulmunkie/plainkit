---
type: breaking
issue: 355
---
The Theme editor and the Layout builder are lazy modules of the site app: open `app.html#/theme` (a shared `#pk-theme=` link still applies) and `app.html#/layout-builder`. The old standalone pages `site/theme/index.html` and `site/layout-builder/index.html` are gone, with no redirect, and so is the last throwaway redirect module.
