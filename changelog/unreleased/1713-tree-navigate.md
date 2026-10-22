---
type: added
issue: 1713
---
`pk-tree` and `pk-tree-item` take `navigate` (router, host or none, as on `pk-link`): `host` makes a plain click on an `href` item a non-cancelable `pk-navigate` notification and nothing navigates, so a Blazor app without the plainkit router navigates through its own `NavigationManager` (`PkTree.Navigate`, `PkTreeItem.Navigate`). The item's own value wins over the tree's.
