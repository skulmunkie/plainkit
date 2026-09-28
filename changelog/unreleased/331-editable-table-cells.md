---
type: added
issue: 331
---
`pk-table` gets an opt-in `editable` mode: columns with an `editor` (text, number, select, switch) edit in place with Enter, F2 or a second tap, Escape cancels, arrow keys and Tab move between cells, and a cancelable `pk-cell-edit` reports each commit with a per-cell validation state (`cellErrors`). `PkTable` gains `Editable`, `CellErrors`, `OnCellEdit` and the column `Editor` options.
