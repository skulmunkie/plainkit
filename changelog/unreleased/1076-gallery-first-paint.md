---
type: fixed
issue: 1076
---
The Gallery no longer jumps while it loads: the top bar and the preview bar keep one row's height before their buttons and the text-size select upgrade (layout shift on a throttled first load drops from 0.03-0.2 to under 0.015), and `core/plainkit.css` is one file instead of an eight-file `@import` chain (74 requests instead of 82 on a cold load).
