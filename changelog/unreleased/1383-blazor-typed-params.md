---
type: breaking
issue: 1383
---
Blazor parameters for enum and number props are typed: `Size` on `PkAvatar`, `PkCheckbox`, `PkContainer`, `PkField`, `PkIcon`, `PkInput`, `PkSpinner` and `PkSwitch` is now an enum (`AvatarSize`, `CheckboxSize` and so on) instead of a string, and `PkEmptyState.Level`, `PkFieldList.Level` and `PkFieldGroup.Columns` are `int`. New typed parameters: `PkStat.DeltaDirection`, `PkSplitButton.Type`, `PkDrawer.Side` and `PkDataTable.Density`. Wire values are unchanged; replace `Size="sm"` with `Size="AvatarSize.Sm"` (and so on).
