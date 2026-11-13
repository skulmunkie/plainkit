---
type: fixed
issue: 1878
---
The static slotted master-detail page now takes a flat `pk-list-group` of links (`aria-current` on the current row) as its master list instead of a `pk-side-nav`, and on a phone with a record open it draws its own Menu button that opens the list as a drawer over the record; choosing a row, Escape or a tap outside closes it (#1878).
