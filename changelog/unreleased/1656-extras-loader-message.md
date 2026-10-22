---
type: added
issue: 1656
---
The loader names the package to add when a tag from an extra (`<pk-canvas>`, `<pk-markdown>`, `<pk-markdown-editor>`) is on a page and its module is not in the folder: one log line gives the package id, the zip (`plainkit.canvas-<version>.zip`, unzipped over the runtime folder) and the Pages path, instead of the generic "could not load". The shipped registry exports `extras` (tag to package id, from `packages.json`) for it.
