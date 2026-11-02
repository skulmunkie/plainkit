---
type: added
issue: 1844
---
pk-dashboard-page accepts widgets of kind "table": load(key) resolves { columns, rows, caption? } and the card draws a pk-table across the whole row, with the same loading, error-with-Retry and hidden-on-null behaviour as stat and chart widgets; no rows shows the empty state of the card.
