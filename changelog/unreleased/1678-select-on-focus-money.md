---
type: fixed
issue: 1678
---
`select-on-focus` now works on a money-formatted `pk-input` (the whole number is selected and survives the mouse-up), and a field spec takes `selectOnFocus` (`PkFieldSpec<T>.SelectOnFocus`) for any input kind.
