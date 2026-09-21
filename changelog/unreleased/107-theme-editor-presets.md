---
type: added
issue: 107
---
The theme editor has a Presets tab: built-in presets (the default, a high-contrast theme with text and surfaces at 7:1 or better in both themes, and a compact and a roomy density) replace the current edits, and your own themes can be saved by name, applied, renamed and deleted. Saved themes live in localStorage under the new `savedKey` option (`pk-theme-editor-saved` by default, `false` for none) as a per-viewer convenience: a blocked storage is logged and they last until the page closes. From code: `editor.presets()`, `editor.saved()` and `editor.applyPreset(idOrSavedName)`. The pure logic is `js/theme-presets-logic.js`.
