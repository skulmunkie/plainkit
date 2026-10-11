---
type: fixed
issue: 1143
---
A pk-nav-item with no icon or badge no longer reserves an empty box for them, and a pk-menu-item with a slotted description gets its taller row again: the empty parts are now hidden by the element when their slot is empty, instead of by selectors that browsers do not match.
