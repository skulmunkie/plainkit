---
type: breaking
issue: 1408
---
More Blazor parameters are typed enums instead of strings (fourth batch, page and app; `PkTray.Size` and `PkWorkspace.ActivePane` stay strings because they are two-way bound): `Variant` and `TabsFrom` on `PkPageHeader`, `State` on `PkPageShell`, `Mode` on `PkRecordPage`, `TabsFrom` on `PkRecordForm` and `PkDetailLayout`, `Preset`, `Theme` and `Loading` on `PkFrame`, `Edge` on `PkTray`, `Format` and `Length` on `PkLocalTime`, `Live` on `PkLog`, `Fit` on `PkMedia`, `Kind` on `PkChart` and `Width` on `PkDesignSurface`. They are nullable and sent only when set (parameters with a default keep it), as before. Wire values are unchanged; replace `Kind="bar"` with `Kind="ChartKind.Bar"`, `Mode="edit"` with `Mode="RecordPageMode.Edit"` and so on (the type is the component name plus the parameter name).
