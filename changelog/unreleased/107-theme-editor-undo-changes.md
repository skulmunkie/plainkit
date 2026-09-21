---
type: added
issue: 107
---
The theme editor has undo and redo (buttons, Ctrl or Cmd+Z, Shift+Z or Y outside a text field; typing in one field is one step, and Reset all and a preset are steps too) and a Changes tab: "3 changes", every edit listed against the stylesheet value with its scope (both themes, dark or light), a Reset for each edit and a Reset group for each family of tokens. `editor.undo()` and `editor.redo()` do the same from code. The pure logic is `js/theme-history-logic.js`.
