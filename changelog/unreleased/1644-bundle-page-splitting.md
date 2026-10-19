---
type: changed
issue: 1644
---
`core/tools/bundle-page.mjs` now uses code splitting: the code elements load on demand (a table's editing, column resize, expand and scope, the log toast output) stays in lazy chunks under `chunks/` instead of being inlined into `plainkit.bundle.js`, so the size-comparison page bundle drops from 40.3 to 31.2 KB gzip (35.4 to 27.5 KB brotli) on a cold load, at 10 requests instead of 4. Publish the whole output folder, not only the two files.
