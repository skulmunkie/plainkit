---
type: added
issue: 1339
---
A module of an app can set `navFilter: true` to put the side nav's filter box on its menu (the site Gallery does). The Gallery embed page keeps its width, text size, drawer, opened folds and theme in the state store (`pk.gallery`, `pk.app`, reading the old `pk-gallery-*` and `pk-site-theme` keys once) and draws its nav with the framework's nav rows, so it no longer carries its own copies. Refs #1339.
