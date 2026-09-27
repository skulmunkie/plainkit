---
type: fixed
issue: 397
---
`js/brand-palette-logic.js` (`generatePalette`, `applyPalette`, `paletteRows`) is a general-purpose utility, not theme-editor-private: `generatePalette` takes a `tokens` option to write a consumer app's own custom-property names instead of Plainkit's.
