---
type: fixed
issue: 129
---
"Select all" on a big `PkTable` no longer closes the Blazor Server circuit: a selection of 64 rows or more goes to the server as runs of row indexes (5,000 rows: a few bytes instead of about 33 KB of ids, over SignalR's 32 KB receive limit), and `PkTable` expands them to the ids in row order before `Selected`, `SelectedChanged` and `OnSelect` see them. A raw `<pk-table @onpk-select>` still receives the whole selection.
