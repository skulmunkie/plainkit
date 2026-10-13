---
type: removed
issue: 361
---
The standalone Gallery page is retired, with no redirect: the Gallery lives only in the site app, and the old address stops working. Migration: update bookmarks, links and docs to the new address; the old one does not redirect. Old to new: `site/gallery/index.html` becomes `app.html#/gallery`, and `site/gallery/index.html#/elements/pk-button` becomes `app.html#/gallery/elements/pk-button`. `site/gallery/embed.html`, `preview.html` and `<pk-gallery>` are unchanged. `site/shell.js` (the old page header) is gone with it.
