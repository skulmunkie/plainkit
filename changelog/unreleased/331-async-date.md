---
type: added
issue: 331
---
An editable pk-table can save asynchronously: a pk-cell-edit handler calls event.detail.wait(promise), the cell is aria-busy until it settles, and a rejection puts the previous value back and shows its message (aria-invalid, announced, out of the undo history). A new date editor (editor: "date") is a native date input holding an ISO date, with min and max. Blazor gains OnCellsPaste for the pk-cells-paste summary and PkTableEditor.Date.
