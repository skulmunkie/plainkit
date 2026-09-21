---
type: added
issue: 107
---
The theme editor has a Palette tab: pick a brand colour (and optionally a neutral tint and a warn colour) and it generates the accent, fill, hover and link colours and the text and surface ramps of both themes, so every documented text pair meets 4.5:1. Each pair is shown as a swatch with its ratio; when the brand colour itself is too light or too dark to serve as text or as a fill, it says how it moved and where it landed. Apply writes the result as ordinary edits you can still change, and `editor.applyBrand(colour, { neutral, warn })` does the same from code. The generator is pure (`js/brand-palette-logic.js`, `generatePalette`, `applyPalette`, `paletteRows`), the pair list is shared (`AA_PAIRS` in `js/theme-editor-logic.js`), and a property test over a grid of hues, lightnesses and greys, extremes included, never lets a pair fall below 4.5:1.
