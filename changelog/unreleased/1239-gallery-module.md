---
type: changed
issue: 1239
---
The site's Gallery module declares real routes that name the gallery's page types (overview, foundations, elements, element, samples, not found), draws them in one frame it builds once (the preview bar, the view and the Details drawer), and keeps the viewport, the text size and the Details drawer in its own store (`pk.gallery`, the old `pk-gallery-*` keys are read once); the Settings page edits the same two display settings. The embed page, `<pk-gallery>` and the sample frames are unchanged; the gallery's frame, tree and lazy sample frames moved out of `gallery.js` into shared files, and the embed's frames follow `data-theme` instead of a `site-theme` event.
