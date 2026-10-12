---
type: added
issue: 264
---
`pk-field-group` field specs accept `format` ("money"), `decimals`, `currency` and `locale` on input kinds, so an amount field can be drawn from a spec.
In Blazor, `PkFieldSpec` gains `Format`, `Decimals`, `Currency` and `Locale`; `PkFieldDef` and those spec members are now generated from `fieldMembers` in the field-group mapping.
