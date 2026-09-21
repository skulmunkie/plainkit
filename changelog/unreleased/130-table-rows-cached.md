---
type: changed
issue: 130
---
`PkTable` serialises its rows and columns only when `Items` (reference or count), `Columns` or `IdOf` change: a parent re-render with the same parameters no longer rebuilds the 380 KB rows attribute of a 5,000-row table (about 70 ms and 9 MB allocated before, about 0.5 ms and 13 KB now). `PkDataList` keeps its wrapped first column between renders so its table benefits too. An item changed inside the list you passed needs a new list or the new `PkTable.Refresh()`.
