---
type: fixed
issue: 350
---
The links a `pk-navbar` (the brand and the page links) and a `pk-breadcrumb` (the trail) style themselves are no longer overridden by the page's blanket link colour and underline: a document rule always beats an element's `::slotted` rule, so the brand looked like a page link and the current crumb like a link. A heading a script focuses after a route change (`h1[tabindex="-1"]`) gets a ring that hugs its text instead of the whole row.
