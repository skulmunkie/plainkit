---
type: added
issue: 1946
---
PkListPage and PkDataTable take UrlState (null off, empty = the plain names q, sort, desc, page, f.<key>, a value = prefix) to keep the list view in the address, and OnUrlChange reports the address (Url). New lab page /lab/url-state and a real-browser case: search, open a row, Back restores the view.
