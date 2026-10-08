---
type: added
issue: 885
---
`pk-data-table` has a `focus(where)` method so a host need not reach into its shadow tree: no argument focuses the search box (the first row when the search is hidden), `"next"` moves to the row after the focused one (the first when none has focus), and `"previous"`, `"first"` and `"last"` move only while a row has focus. It returns whether focus moved.
