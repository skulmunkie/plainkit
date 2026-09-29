---
type: notes
issue: 577
---
Adds an internal dev tool, `node core/tools/usage-index.mjs`, that reports how many times each `pk-*` element is referenced across the
repo's own source (other elements, site modules, gallery examples, samples, docs and Blazor mappings), and flags zero-reference and
heavily-composed elements. No effect on the published SDK or package.
