---
type: added
issue: 1025
---
PkListRequest has `MultiFilters`: the values of a `multiselect` filter of pk-data-table and the list page (`PkDataTable`, `PkListPage`) reach the `Load` delegate as a list of strings per filter key. `Filters` keeps the single-value filters as before.
