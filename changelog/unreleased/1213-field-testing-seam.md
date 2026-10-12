---
type: added
issue: 1213
---
`PlainKit.Blazor.Testing` adds page-wide field seams on the context service provider (bUnit Services): `Services.FieldStates()` lists every shown field of every `PkFieldGroup<T>` in document order, `Services.FieldState(key)` returns one (null when no group shows it) and `await Services.CommitFieldAsync(key, value)` commits on the group that shows the key, without naming the item type.
