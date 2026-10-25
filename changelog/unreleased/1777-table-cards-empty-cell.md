---
type: fixed
issue: 1777
---
pk-table's phone cards (and so `PkListPage`, `PkDataTable` and `PkTable` on a phone) leave out a cell with nothing in it, label and all, so a column that has a value for only a few rows no longer draws a dangling label in every other card; `HidePhone` is still the way to hide a whole column.
