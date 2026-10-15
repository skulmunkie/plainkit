---
type: changed
issue: 1253
---
`elements/api.json` no longer carries each element's `examples` (usage snippets), which makes the npm package about 24 KB smaller and the file the layout builder and console fetch about 21 KB lighter. The complete file, `dist/elements/api.full.json` (api.json plus `examples`), ships on the Pages site and in the release zip, not in the npm package. Migration: a tool that reads `examples` from `elements/api.json` should fetch `https://skulmunkie.github.io/plainkit/dist/elements/api.full.json` instead (or read the examples in the agent skills' element references, which still print them all).
