---
type: added
issue: 1720
---
A combobox field spec takes `debounce` (milliseconds; `PkFieldSpec.DebounceMs` in Blazor): `pk-field-group` passes it to the combobox, so a search-as-you-type field waits for a pause before its search or `pk-combo-query` runs.
