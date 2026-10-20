---
type: added
issue: 1684
---
A `pk-table` column's `shed` takes any container width, not only the steps 1, 2 and 3 (24, 36, 48rem): a number above 3 is rem, and a length such as `"60rem"` or `"900px"` also works. `PkTableColumn.Shed = 60` drops the column when the table is narrower than 60rem. The rule for a custom width loads on demand, so a table that uses only the steps pays nothing.
