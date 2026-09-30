---
type: notes
issue: 736
---
Component and page sources are now checked for raw structural `div` and `span` (rule T1 in `core/tools/tier-tags.mjs`), with today's 139 hits recorded in `core/tools/tier-tags.baseline.json` so they can only shrink; shell and element sources are exempt.
