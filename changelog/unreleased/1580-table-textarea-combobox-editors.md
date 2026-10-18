---
type: added
issue: 1580
---
An editable `pk-table` column can use `editor: "textarea"` (Enter commits, Shift+Enter adds a line; the editor opens over the cell without changing the row height) or `editor: "combobox"` (a native input with a list of the column's `options`; the text must be an option unless the column is `free`; the new `pk-cell-query` event lets the host fill the list as the user types). Both commit, paste, undo and `detail.wait` like the other editors. The Blazor `PkTableEditor` values are not added yet.
