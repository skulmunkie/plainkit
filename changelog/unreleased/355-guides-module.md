---
type: added
issue: 355
---
The Guides open inside the site app at `app.html#/guides` and `#/guides/<id>` (a lazy module that reuses the guide content and the body-word search); the `doc` page type accepts a `searchItems(query, ctx)` callback and builds its links as router addresses. The standalone Guides page still works.
