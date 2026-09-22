---
type: fixed
issue: 131
---
`pk-table` windows its body at 500 rows or more (a non-expandable, non-slotted table): only the rows near the scroll frame's viewport are drawn instead of every row. A 10,000-row table now renders in about 33 ms instead of 2.3 s and re-sorts in about 33 ms instead of 1.75 s (`node scripts/bench/scale.mjs --only=table`), with about 23 rows in the DOM instead of 10,029. Sort, filter and selection still act on every row, not just the drawn ones.
