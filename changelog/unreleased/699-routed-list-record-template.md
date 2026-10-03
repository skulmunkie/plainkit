---
type: added
issue: 699
---
The template "List page and record page" shows the canonical list-and-record shape: a `list` page (pk-data-table with search, filter, sort and paging) and a `record` page (form with Save and unsaved-changes tracking) as two separately routed pages, a row click navigating to the record and Save navigating back. It replaces the "List and detail (CRUD)", "Master and detail" and "Master and detail with tabs" samples, which put a list and its record on one page and are no longer offered; the "Filter bar, table and bulk actions" pattern is now a pk-data-table, "Routed list and detail" is relabelled "Workspace list and record" (the tool-shell variant), and the choosing guide has a "Which list shape" table.
