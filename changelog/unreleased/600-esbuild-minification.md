---
type: changed
issue: 600
---
Every generated JS and CSS file under `dist/` (elements, `js/`, `plainkit.js`, `modules/`) is now real-minified with esbuild (identifier shortening, dead-code elimination, constant-folding), shrinking transfer size further than the previous comment-stripping alone; the blanket per-element gzip budget comes down from 4.5 KB to 4 KB to match.
