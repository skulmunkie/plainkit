---
type: added
issue: 300
---
New `pk-badge-popover` (`PkBadgePopover` in Blazor): a status pill that is a real disclosure button (own focus ring, `aria-expanded`, `aria-controls`) and opens a panel of details (`heading`, `details` slot, optional `actions` slot) anchored under it. Escape returns focus to the pill, an outside press or focus leaving closes it, `open` is two-way with `pk-open` and `pk-close`, and on a phone the panel spans the viewport inside the gutters. Replaces wrapping a `pk-badge` in a button next to a `pk-popover`.
