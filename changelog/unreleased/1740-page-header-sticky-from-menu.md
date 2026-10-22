---
type: fixed
issue: 1740
---
A `pk-page-header` with `sticky-from` no longer keeps a stacking context once it is released below the breakpoint, so a dropdown opened from its actions is drawn over the content below it instead of under it.
