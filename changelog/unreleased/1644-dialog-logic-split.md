---
type: changed
issue: 1644
---
`pk-dialog`, `pk-drawer`, `pk-lightbox` and `pk-command-palette` take their open/close wiring from a new small module, `js/dialog-logic.js`, instead of `js/menu-logic.js`, so a page with a dialog no longer downloads the menu keyboard and typeahead helpers: the size-comparison page (per element) goes from 38.4 to 37.5 KB gzip (33.4 to 32.6 KB brotli). What menus import from `menu-logic.js` is unchanged.
