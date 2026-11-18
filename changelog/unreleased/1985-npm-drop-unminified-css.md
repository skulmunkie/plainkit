---
type: changed
issue: 1985
---
The npm package no longer ships the unminified `dist/plainkit.css` (31 KB smaller); `plainkit/plainkit.css` and `plainkit/css` both resolve to `dist/plainkit.min.css`. A plain-HTML page links `dist/plainkit.min.css`; the release zip and the Pages site still carry both files, and the custom-SDK tool works from the minified file alone.
