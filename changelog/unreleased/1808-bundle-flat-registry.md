---
type: added
issue: 1808
---
A `--flat` page bundle also carries `plainkit-registry.js` and the loader looks for it beside the bundle, so a tag that is not in the bundle is reported clearly instead of requesting an `elements/` folder that a flat host does not have.
