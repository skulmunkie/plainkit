---
type: added
issue: 202
---
`pk-side-nav` gains `current-path` and `auto-expand-active`: set the host's current URL and it resolves the deepest-matching `pk-nav-item` as `current` and, with `auto-expand-active`, opens its ancestor branches and collapses the rest — no more hand-rolled active-route and expand-state bookkeeping per app.
