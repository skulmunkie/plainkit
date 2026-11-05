---
type: changed
issue: 1912
---
On a phone, `pk-list-page` and `pk-data-table` are more compact: the search box grows and Filters (an icon button there) sits beside it on the same row, a page with no actions leaves no empty row under the search, an empty table caption no longer adds a padded band above the first card, so the title bar, the search row and the first card are one `--space-3` step apart, and the pager footer is as tall as its content plus a small step. Desktop is unchanged. `--pk-data-table-actions-flex` sets the flex of the actions row on a phone.
