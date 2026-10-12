---
type: added
issue: 264
---
In Blazor, `PkFieldSpec` gains `Format`, `Decimals`, `Currency` and `Locale`; `PkFieldDef` and the plain field members are now generated from `fieldMembers` in the field-group mapping, so the hand-written files are smaller.
