---
type: added
issue: 1725
---
A field spec of `pk-field-group` takes `suffixAction: { icon, label, key }`: an icon button inside the end of an input, which follows the field's disabled and read-only state and raises `pk-field-action` with the field key and the action key. In Blazor, `PkFieldSpec.SuffixAction` (a `PkFieldAction`) and `PkFieldGroup.OnFieldAction`.
