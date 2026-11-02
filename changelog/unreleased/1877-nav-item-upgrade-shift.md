---
type: fixed
issue: 1877
---
A `pk-nav-item` that holds a slotted link keeps its row height, padding and icon column before the element upgrades, so the nav rows no longer jump when the element is defined late.
