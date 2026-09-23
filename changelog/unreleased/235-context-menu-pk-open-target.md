---
type: changed
issue: 235
---
`pk-context-menu`'s `pk-open` detail now carries `target` (the element that was right-clicked, long-pressed or Shift+F10'd) and `context` (the value of its nearest ancestor's `data-pk-context` attribute, if any), so one context menu can serve different `menu` slot content per target. Also: `pk-open` now fires before `showAt` focuses the first menu item, so a host that swaps the `menu` slot synchronously from its `pk-open` handler gets its new first item focused, not the pre-swap one.
