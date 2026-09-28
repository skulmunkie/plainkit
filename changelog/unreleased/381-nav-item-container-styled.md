---
type: changed
issue: 381
---
pk-nav-item works as a link in a pk-navbar: the navbar styles it (a bottom bar for the current page, squared bottom corners) through the new hooks `--pk-nav-item-current-mark`, `--pk-nav-item-current-bg`, `--pk-nav-item-current-weight` and `--pk-nav-item-radius`, so the same item serves the side nav and the navbar. Plain `<a>` links in a navbar look and work as before.
