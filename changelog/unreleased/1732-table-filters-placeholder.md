---
type: added
issue: 1732
---
`pk-table-filters` takes `placeholder`, a hint for the empty search box that differs from its accessible name (`label`); `pk-data-table` forwards it as `searchPlaceholder` (Blazor `PkDataTable.SearchPlaceholder`), and `pk-list-page` config `searchPlaceholder` is now the placeholder while `searchLabel` stays the accessible name.
