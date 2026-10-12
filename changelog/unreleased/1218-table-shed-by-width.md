---
type: added
issue: 1218
---
A `pk-table` column can carry `shed` (1, 2 or 3), and the column drops out when the table itself is narrower than 24, 36 or 48rem, so a table in a narrow pane or card sheds its derived columns before it scrolls sideways at any viewport width; the higher number goes first, and the cards layout keeps every column. Blazor: `PkTableColumn.Shed`.
