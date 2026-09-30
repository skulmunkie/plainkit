---
type: fixed
issue: 684
---
The audit CLI's D8 rule judges each selector in a comma-separated CSS rule on its own, so a documented `::part()` selector no longer masks a raw `pk-*` override sitting next to it in the same rule. D2 now matches a class hint by its full name instead of by substring, so utility classes like `.text-danger` or `.stat-grid` are no longer flagged as hand-rolled `pk-text`/`pk-stat` duplicates.
