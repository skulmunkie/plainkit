---
type: added
issue: 717
---
The audit dashboard has a UI review panel next to the module baseline: it lists the findings of the last `node scripts/ui-review.mjs` run (`review-output/manifest.json`), filters them by text or errors only, and shows a finding's detail and FIX line in the Properties panel. When the file is absent it says so and names the command that writes it. The panel is its own lazily loaded chunk, and a new `reviewUrl` option points it at another manifest.
