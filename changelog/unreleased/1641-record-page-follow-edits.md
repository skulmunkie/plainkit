---
type: added
issue: 1641
---
`PkRecordPage` has an opt-in `FollowEdits` (and `CopyOf`): the typed `When`, `Disabled`, `ReadOnly`, `LabelWhen` and `HelpWhen` follow each committed field change, evaluated on a draft copy of the item that Save never sees as the loaded item, and the form updates in place without losing focus or typed text. `pk-field-group` has a `patch(fields)` method that does the in-place update.
