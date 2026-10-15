---
type: added
issue: 1420
---
`pk-data-table` raises `pk-query-change` with `{ sortKey, descending, search, page, pageSize, filters }` when the reader sorts, searches, filters, pages or changes the page size, so a host can keep its own state in sync (the basis for two-way binding in Blazor).
