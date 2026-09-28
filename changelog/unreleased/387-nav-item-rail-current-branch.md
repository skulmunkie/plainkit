---
type: fixed
issue: 387
---
`pk-nav-item` marks a collapsed branch with `data-current-branch` when one of its flyout children is current, so the icon rail shows an active indicator on the branch itself, not only inside the (hidden) flyout. The `ui-review.mjs` audit also stops flagging the standard visually-hidden pattern (`pk-skip-link` before focus, a `u-sr-only` live region) as clipped content or a small tap target.
