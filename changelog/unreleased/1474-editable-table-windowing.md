---
type: added
issue: 1474
---
An editable `pk-table` now windows at 500 or more rows like any table, so pages with thousands of editable rows stay fast. The active row and the row being edited stay drawn wherever they are, arrow keys move by row id and scroll the cell into view, PageUp/PageDown and Ctrl+Home/End jump (announcing "Row N of M"), `aria-rowcount` and `aria-rowindex` describe the whole view, and paste and undo reach rows that are not drawn (one undo takes back a whole paste, however large). Undo now also announces the restored value instead of failing silently.
