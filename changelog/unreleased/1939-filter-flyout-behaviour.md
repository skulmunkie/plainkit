---
type: added
issue: 1939
---
With `filterPanel: "flyout"` (`placement="start"` on `pk-table-filters`) the open filter panel overlays the table area from the inline-start edge without moving the rows, stays inside the area (its body scrolls, Close and Clear filters stay in view), and Escape closes it and returns focus to the Filters trigger; the trigger now carries `aria-controls`. New hook `--pk-table-filters-max`.
