---
type: fixed
issue: 557
---
In `pk-date-range-picker`'s calendar popover, the day focused when the popover opens now shows the standard focus ring (`focus-visible`), and the popover mirrors to the trigger's inline-start edge in right-to-left instead of aligning to its physical left edge (issue #558, `positioning.js` `placement` now accepts `rtl`).
