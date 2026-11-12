---
type: fixed
issue: 1936
---
pk-app-shell no longer draws an empty footer bar when every slotted footer child is hidden at the current breakpoint (for example data-show-above="phone" on a phone); it looks again when a breakpoint is crossed.
