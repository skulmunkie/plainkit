---
type: added
issue: 1939
---
The filter flyout (`filterPanel: "flyout"`) now slides in from the inline-start edge (from the right in right-to-left), with no motion under `prefers-reduced-motion: reduce`; at 640px and below it is a full-width sheet over the table area; and it re-bounds itself when the window is resized while open. Blazor: `PkDataTable` takes `FilterPanel` (`PkFilterPanel.Inline` or `Flyout`); `PkListPage` takes `filterPanel` in its `Config`.
