---
type: fixed
issue: 1781
---
A clickable pk-table (and `PkTable`, `PkDataTable`, `PkListPage` with `OnRowClick`) no longer raises a row click when the click lands on a `pk-link` or `pk-button` in a cell; the control keeps its click, as a native link or button already did.
