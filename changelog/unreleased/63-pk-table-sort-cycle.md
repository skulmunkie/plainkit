---
type: changed
issue: 63
---
A third activation of the same `pk-table` header clears the sort, so a list can return to its natural order: `pk-sort` then carries a null `key` and `direction` (a `manual` table reports it too), `sort` becomes empty and `sortBy(null)` does the same. The cycle was ascending and descending only.
