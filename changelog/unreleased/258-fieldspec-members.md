---
type: added
issue: 258
---
`PkFieldSpec<TItem>` gains `Placeholder`, `Rows` (textarea) and `Help` (a help tooltip beside the label), `PkFieldGroup` now emits `Key` as each control's `name` (as documented), and `PkFieldSpec<TItem>.Bool(key, label, get, set)` builds a checkbox spec over a `bool` property. The string `Get`/`Set` API is unchanged.
