---
type: added
issue: 331
---
An editable pk-table accepts a paste from a spreadsheet: tab-separated text fills a block from the active cell, each cell through the cancelable pk-cell-edit (new detail.source) so validation and Blazor OnCellEdit apply, invalid cells are flagged, one undo reverts the paste, and pk-cells-paste summarises it.
