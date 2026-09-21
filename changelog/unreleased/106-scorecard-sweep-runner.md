---
type: added
issue: 106
---
`node scripts/scorecard-sweep.mjs` runs the whole scorecard analysis headless in one command: the size sweep (every gallery view, template and element example, six widths, both themes), the scorecard run with the quality, performance and scale scores, and every gallery route in a real tab for paint, layout shift, long tasks and dev-console errors. It prints a summary worst first, writes JSON to `scratch/scorecard/`, and refreshes the tracked `sweep-report.json` only with `--write-report`.
