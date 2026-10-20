---
type: added
issue: 1687
---
`pk-combobox` has a `clearable` attribute (`PkCombobox.Clearable`, and `clearable` / `Clearable` on a combobox field spec): while a value is chosen a clear button at the end of the box sets it back to empty, raising `change` and `pk-combo-select` with an empty value, so an optional picked value can be emptied without hand-written markup.
