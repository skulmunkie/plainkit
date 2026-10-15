---
type: added
issue: 1385
---
`PkSideNav` gains `OnOpen` (the drawer opened, `pk-open`) and `OnClose` (the drawer asked to close, `pk-close`, with `e.Reason`). The other events of `PkSideNav` and `PkAppBarSearch` (`pk-nav-toggle`, `pk-query`, `pk-select`, `pk-toggle`) were already exposed and are unchanged.
