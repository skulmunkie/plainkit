---
type: fixed
issue: 1364
---
A Blazor PkListPage with Columns, IdOf and RowHrefTemplate calls Load for its first page on first render, without a typed search (the page's refresh() fixed it; a bUnit test and a real-browser case now guard it).
