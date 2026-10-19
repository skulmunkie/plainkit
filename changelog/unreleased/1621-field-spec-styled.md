---
type: added
issue: 1621
---
A field group `select` field takes `styled: true` (Blazor: `PkFieldSpec.Styled`) to render the themed list (a `pk-combobox` in select mode) instead of the browser's native select, with the same options, value, required, disabled and keyboard behaviour; unset keeps the native control, which stays the better choice on a phone.
