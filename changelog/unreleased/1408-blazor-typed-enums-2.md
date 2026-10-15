---
type: breaking
issue: 1408
---
More Blazor parameters are typed enums instead of strings (second batch, layout and alignment): `Direction`, `Align` and `Justify` on `PkCluster` (`ClusterDirection`, `ClusterAlign`, `ClusterJustify`); `Align` on `PkStack`, `PkFieldRow`, `PkFormActions` and `PkContainer` (`StackAlign`, `FieldRowAlign`, `FormActionsAlign`, `ContainerAlign`); `PkContainer.Scroll`; `PkRadioGroup.Direction`; `Orientation` on `PkButtonGroup`, `PkCard`, `PkSortable` and `PkSplitter`; `Layout` on `PkField` and `PkFieldList`; `LabelPosition` on `PkDivider` and `PkSwitch`. They are nullable and sent only when set (`PkSplitter.Orientation` keeps its `Horizontal` default), as before. Wire values are unchanged; replace `Align="end"` with `Align="FormActionsAlign.End"`, `Orientation="vertical"` with `Orientation="CardOrientation.Vertical"` and so on (the type is the component name plus the parameter name).
