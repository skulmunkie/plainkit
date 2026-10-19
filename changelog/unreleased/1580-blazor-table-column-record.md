---
type: added
issue: 1580
---
Blazor: the `PkTableColumn` record, its typed `PkTableColumn<TItem>` and the `PkTableEditor`, `PkTableColumnType` and `PkTableColumnAlign` enums are now generated from the table meta, so they follow the element. New: the `Textarea` and `Combobox` editors, `Free`, and `Min` and `Max` as a `PkTableBound` that takes a number, a `DateOnly` or an ISO date string, so a date column can be bounded.
