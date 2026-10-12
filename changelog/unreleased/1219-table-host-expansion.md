---
type: added
issue: 1219
---
`pk-table` has `expander="none"` (`Expander` in Blazor) to leave out its toggle column when the host opens rows from its own control through `expanded`, and a row can have several detail panels: the slot `detail-<rowId>.<name>` is shown when `expanded` holds `"<rowId>.<name>"`.
