---
type: changed
issue: 1253
---
`dist/manifest.json` lists only the files the npm package carries; the gallery, the exported agent docs, `descriptions.json` and the other files the package leaves out are listed, with the same SRI hashes, in `dist/manifest.extras.json` (in the release zip, attached to the release, and on the Pages site). The custom SDK export reads and recomputes it too. The npm package is about 10 KB smaller packed.
