---
type: added
issue: 855
---
Blazor: `PageBase` has `ShowSuccess`, `ShowWarning` and `ShowError` (and `ShowError(exception, title?)`, which logs and shows a user-facing exception's message as it is, any other as a generic line) over `IPkNotifications`. `PkRecordEditor` toasts "Saved", "Deleted" and "Could not save" or "Could not delete" when it is given a `Notify` (opt-in: without one it toasts nothing, as before); `Messages = new PkRecordMessages(Saved: "Order saved", Deleted: "")` words or silences them.
