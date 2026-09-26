---
type: fixed
issue: 339
---
In a scrolling `pk-tabs` strip that overflows (a phone), moving to a tab with the arrow keys, Home, End or a click now scrolls that tab fully into view, clear of the edge fade (it was left cut off), smoothly unless the reader prefers reduced motion. The fade on the side that has more tabs follows the scroll, the tab list and the width and mirrors in right-to-left, and a mouse wheel over the strip scrolls it sideways. The strip no longer uses scroll snapping, which undid the scroll.
