---
type: added
issue: 107
---
`PkThemeEditor` takes `InitialTheme` (the override CSS or JSON to start from, used when nothing was kept for the viewer), `Presets` (a list of `PkThemePreset(name, theme, description)` of your own, listed after the built-in ones) and raises `OnThemeChanged` with the exported CSS a moment after every change; the package README says how to ship the exported theme as a file linked after the toolkit's stylesheet. The theme editor module takes the same as the options `initial` and `presets` (text or objects, read with the import rules; a bad preset is logged and left out), and the Blazor bridge reports changes only after the editor has mounted.
