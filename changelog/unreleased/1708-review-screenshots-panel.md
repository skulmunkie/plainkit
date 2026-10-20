---
type: added
issue: 1708
---
The audit dashboard has a Screenshots panel for the UI review: the shots in `review-output/` as a gallery you filter by element or scenario, viewport and theme, with an only-shots-with-findings toggle, the findings and their `FIX:` text, and click to enlarge. `node core/tools/serve.mjs` serves them read-only under `/_audit/review/` (only `.png` files and `manifest.json` of that one folder; `--review-dir=<folder>` points it at another, such as an unzipped CI artifact). Where that route does not exist, as on the hosted site, the panel shows an empty state naming `node scripts/ui-review.mjs` and `node core/tools/serve.mjs`.
