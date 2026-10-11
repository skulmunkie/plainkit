---
type: added
issue: 355
---
The Gallery opens inside the site app at `app.html#/gallery/...` (a lazy module: Overview, Foundations, Elements and Samples in the side nav, the existing gallery views under one route, element search in the header); the app owns the bar, theme and nav. The standalone gallery page still works. `mountRouter` in hash mode now honours `base` as a path prefix inside the address.
