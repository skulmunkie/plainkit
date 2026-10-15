---
type: added
issue: 1409
---
PkDock takes EmptyContent and ToolbarStartContent for its empty and toolbar-start slots. The slot audit of data-table, page-header and doc-page found the rest already covered (PkDataTable) or element-built (PkDocPage nav, bar, aside); mapping EventCallback type names now match the generated Pk*EventArgs, and a mapping test fails on a name the build does not generate (#1410).
