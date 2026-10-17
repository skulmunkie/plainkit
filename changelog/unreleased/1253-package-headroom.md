---
type: changed
issue: 1253
---
In `custom-elements.json` an attribute names its field (`fieldName`) and the type, default and description are on that field once instead of twice, and `dist/manifest.json` is compact (one file per line); the npm package is about 130 KB smaller unpacked.
