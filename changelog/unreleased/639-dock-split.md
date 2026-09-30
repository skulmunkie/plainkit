---
type: notes
issue: 639
---
`pk-dock`'s behaviour is split across `dist/elements/dock.js` and three new shared chunks (`dist/js/dock-render.js`, `dist/js/dock-drag.js`, `dist/js/dock-flyout.js`) it imports; `dock.js` itself now fits under the blanket per-element gzip budget, so its one-time size override is removed. No prop, attribute, event or visual behaviour changes; a project that vendors `dock.js` on its own now also needs the three new files alongside it.
