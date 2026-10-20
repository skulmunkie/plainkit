---
type: added
issue: 1690
---
A confirm, prompt or open dialog takes `onConfirm` (Blazor: `PkDialogOptions.OnConfirm`, `Func<Task<string?>>`): it runs when the confirming button is pressed while the dialog stays open with that button busy; null closes it, a message stays inside the dialog so the user can cancel or retry. A dialog field `{ type: 'checkbox' }` (Blazor: `PkDialogField.Type = "checkbox"`) adds a checkbox whose value comes back as `"true"` or `"false"`.
