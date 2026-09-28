---
type: added
issue: 331
---
An editable `pk-table` now undoes and redoes committed cell edits with Ctrl/Cmd+Z and Ctrl+Y (or Ctrl/Cmd+Shift+Z) on the active cell. Each step raises the same cancelable `pk-cell-edit`, so a host that validates or saves edits sees undo like any other edit and may refuse it; no new API.
