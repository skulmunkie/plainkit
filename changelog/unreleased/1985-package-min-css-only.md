---
type: changed
issue: 1985
---
The npm package no longer ships the unminified `dist/plainkit.css` (about 5.7 KB packed smaller); `plainkit/plainkit.css` and `plainkit/css` both resolve to `dist/plainkit.min.css`, and the release zip and Pages site still carry both files.
