---
type: added
issue: 51
---
`pk-table` gets `current-row` (`PkTable.CurrentRow`, `PkDataList.CurrentRow`): the row whose record is open is tinted, marked with an accent bar and given `aria-current`. It is host-set: the table never changes it and raises no event for it.
