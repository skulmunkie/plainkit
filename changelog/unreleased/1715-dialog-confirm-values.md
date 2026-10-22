---
type: added
issue: 1715
---
`PkDialogOptions.OnConfirmValues` gives a confirm, prompt or open dialog's action the trimmed field values and the pressed button (`PkDialogResult`); a returned message keeps the dialog open with the typed text, so a rejected value is corrected without retyping. In JavaScript `onConfirm(values, action)` receives the same.
