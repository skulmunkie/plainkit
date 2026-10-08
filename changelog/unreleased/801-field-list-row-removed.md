---
type: breaking
issue: 801
---
`PkFieldListRow` is removed (no obsolete alias): `PkFieldList` now hides an empty slotted pair itself. Replace `<PkFieldListRow Label="Number" Value="@x" />` with `<dt>Number</dt><dd>@x</dd>` (rich content goes in the `dd`); a pair whose `dd` has no element and no text is hidden, so the `SkipEmpty` default needs no code. For `SkipEmpty="false"` set `ShowEmpty` on the `PkFieldList` (it also shows empty `Items` rows); for `When="@cond"` use `@if (cond) { <dt>..</dt><dd>..</dd> }`.
