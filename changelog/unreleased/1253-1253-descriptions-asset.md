---
type: changed
issue: 1253
---
`dist/descriptions.json` (the long-form element descriptions) is no longer in the npm package, about 46 KB smaller packed (1,380,965 to 1,334,169 bytes). It is still generated into `dist/`, so it stays in the release zip `plainkit-dist-<version>.zip` and on the Pages site at `https://skulmunkie.github.io/plainkit/dist/descriptions.json`, and `dist/llms.txt` links that URL. The Blazor package leaves it out as a design-time file. Tools that read it from `node_modules/plainkit/dist/` should fetch it from the Pages URL or the release zip. Refs #1253.
