---
type: added
issue: 332
---
`pk-kanban` scrolls while a card is dragged: the column under the pointer scrolls near its top or bottom edge and the board scrolls sideways near its left or right edge (on a phone, to reach a column that is off screen), faster the closer the pointer is to the edge. Under `prefers-reduced-motion` it scrolls at a steady slow speed. The scrolling stops on drop, cancel and when the board is removed.
