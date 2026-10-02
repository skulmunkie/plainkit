---
type: changed
issue: 805
---
`PkCard`, `PkStat`, `PkEmptyState` and `PkFieldList` are generated from their mappings like the other wrappers; the hand-written razor and `PkStatTone` in `PkEnums.cs` are gone. Parameter names are unchanged. Two small typing differences: `PkStat.Tone` is nullable (unset sends no attribute) and `PkStat.OnClick` is an `EventCallback<PkActivateEventArgs>` (a lambda still binds; a non-generic `EventCallback` value no longer does).
