---
type: changed
issue: 514
---
The app entry no longer loads the theme override, token-parsing and colour code: the three calls it needs (set, read and toggle the theme) live in `js/theme-core.js`, and `js/theme.js` re-exports them, so the public API is unchanged. The entry graph is 2.2 KB gzip smaller.
