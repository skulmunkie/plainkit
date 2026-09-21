---
type: fixed
issue: 104
---
A `PkTable` or `PkDataList` column key is used exactly as given (column definition, row field, cell slot, the `Sort`, `OnSort` and `Filters` keys and `PkListRequest.SortKey`), so a PascalCase key such as `Name` shows its cells instead of empty ones; a column without `Text` or `Cell` finds the item property whatever the casing.
