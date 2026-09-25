---
type: changed
issue: 282
---
The gallery data is split: `gallery.data.js` now holds an element index (`ELEMENTS`: tag, name, title, group, summary) and each element's full API and examples live in `site/gallery/elements/<name>.data.js`, loaded on demand with `loadElement(tag)` or `loadAllElements()`. The gallery loads only the element page it shows, and the snapshot size cap no longer limits how much documentation an element can carry.
