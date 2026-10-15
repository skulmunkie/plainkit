---
type: breaking
issue: 1408
---
More Blazor parameters are typed enums instead of strings (first batch): `Variant` on `PkBadge` and `PkBadgePopover` (`BadgeVariant`), `PkProgress` (`ProgressVariant`), `PkSpinner`, `PkSkeleton`, `PkSplitButton` and `PkListGroup`; `PkProgress.Size`; `PkAvatar.Shape` and `Status`; `Tone` on `PkCard`, `PkEmptyState` and `PkHint`; `PkTimelineItem.Status`; `PkStat.DeltaUnit`; `PkButton.Type` (`ButtonType`); `Gap` on `PkStack`, `PkGrid`, `PkCluster` and `PkList`; `PkContainer.Padding`. They are nullable and sent only when set, as before. Wire values are unchanged; replace `Variant="danger"` with `Variant="BadgeVariant.Danger"`, `Gap="lg"` with `Gap="StackGap.Lg"` and `Type="submit"` with `Type="ButtonType.Submit"` (and so on).
