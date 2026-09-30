---
type: added
issue: 750
---
`scripts/ui-review.mjs` splits each scenario's time into phases (open, fixed waits, other steps, audit, screenshot) in `manifest.json` (`phases`) and prints their totals, so the slow part of a review can be found.
