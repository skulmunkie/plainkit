---
type: added
issue: 1664
---
`pk-combobox` has a `debounce` property (`PkCombobox.DebounceMs`): `pk-combo-query` (`OnSearchInput`) fires once, with the latest text, after that many milliseconds without typing, so a host that fetches options no longer searches on every keystroke. The built-in filter is not delayed. Cancelling a superseded search is tracked separately on the issue.
