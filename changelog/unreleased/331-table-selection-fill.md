---
type: added
issue: 331
---
An editable pk-table selects a range of cells (Shift+arrows, Shift+click, by row id so it works across a windowed table), fills the top row down it with Ctrl+D (each cell through the cancelable pk-cell-edit with source "fill", one undo for the whole fill) and copies it as tab-separated text with Ctrl+C.
