---
type: fixed
---
The upgrading references (SDK and Blazor skills) say that a removed component used as a Razor tag is only the warning RZ10012, not a compile error (turn it into an error while upgrading), how `PkDataList.Items` becomes `PkDataTable.Load`, and that an unreleased target is read from `changelog/unreleased/`. `pk-data-table` and `pk-lookup-picker` log a one-time console warning when a leftover `config` attribute or property is set (it is ignored since `config` was removed).
