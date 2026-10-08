---
type: fixed
issue: 897
---
A dialog from the dialog service (`ctx.dialogs.confirm`, `alert`, `prompt`, `open`) that is answered before its `pk-dialog` has upgraded now settles at once, instead of staying in the page and blocking the next dialog.
