---
type: added
issue: 1946
---
pk-data-table and the pk-list-page config take urlState: the search, sort, page and filters are kept in the address (q, sort, desc, page, f.<key>; a value is a prefix for two lists on one page) with history.replaceState, so a reload or Back restores the view. Opt-in, query mode; pk-url-change reports the address.
