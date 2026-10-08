---
type: added
issue: 865
---
`pk-data-table` takes a starting search term, as the `search` prop or `config.search`: it fills the search box and goes to the first `load(query)`, and a later change by the host replaces it (`pk-table-filters` gets a `value` prop for the box). `pk-table` and `pk-data-table` take `selectPageOnly`, which never offers "Select all N rows" while the header checkbox still selects the page. `PkDataTable` passes them through as `Search` and `SelectPageOnly`.
