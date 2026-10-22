---
type: fixed
issue: 1724
---
The pager footer of `pk-table` (and so of `pk-data-table` and `pk-list-page`) is a bar of its own: a top rule and block padding (`--pk-table-footer-padding`) separate it from the rows and centre the pager, and the page buttons have a resting surface and a boundary of at least 3:1 against the page in both themes (`--pk-pagination-button-bg`, `--pk-pagination-button-border`). The footer and the pager parts (`footer`, `pager`, `pager-summary`, `pager-numbers`, `pager-prev`, `pager-next`) are reachable with `::part()` from `pk-data-table` and `pk-list-page`.
