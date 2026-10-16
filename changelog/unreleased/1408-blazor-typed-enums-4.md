---
type: breaking
issue: 1408
---
More Blazor parameters are typed enums instead of strings (fourth and last batch, page and app): `Variant` and `TabsFrom` on `PkPageHeader`, `State` on `PkPageShell`, `Mode` on `PkRecordPage`, `TabsFrom` on `PkRecordForm` and `PkDetailLayout`, `Preset`, `Theme` and `Loading` on `PkFrame`, `ActivePane` on `PkWorkspace`, `Size` and `Edge` on `PkTray`, `Format` and `Length` on `PkLocalTime`, `Live` on `PkLog`, `Fit` on `PkMedia`, `Kind` on `PkChart` and `Width` on `PkDesignSurface`. They are nullable and sent only when set (parameters with a default keep it), as before. Wire values are unchanged; replace `Kind="bar"` with `Kind="ChartKind.Bar"`, `Mode="edit"` with `Mode="RecordPageMode.Edit"` and so on (the type is the component name plus the parameter name).
