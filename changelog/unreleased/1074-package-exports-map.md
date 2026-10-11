---
type: breaking
issue: 1074
---
The npm package `plainkit` has an `exports` map and a correct `sideEffects` list. Before, `"sideEffects": false` made bundlers (esbuild, webpack, Rollup) drop `import "plainkit/dist/elements/button.js"`, so no element was registered. Now `sideEffects` names the element modules and CSS, and the public entries are `plainkit`, `plainkit/elements/<name>`, `plainkit/css`, `plainkit/app`, `plainkit/js/*`, `plainkit/skills/*`, `plainkit/custom-elements.json`, `plainkit/web-types.json` and `plainkit/package.json`. Migration: replace `plainkit/dist/elements/<name>.js` with `plainkit/elements/<name>`, `plainkit/dist/plainkit.min.css` with `plainkit/css` and `plainkit/dist/js/<file>.js` with `plainkit/js/<file>`; any `plainkit/dist/*` path still resolves for this release and is removed in the next, and a path outside the map (for example `plainkit/core/...`) no longer resolves.
