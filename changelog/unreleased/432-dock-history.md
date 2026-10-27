---
type: added
issue: 432
---
A dock layout has undo and redo helpers (`js/dock-history.js`): a drag or resize is one step, a failed or unchanged operation records nothing, and every undone layout passes the dock model's own validation.
