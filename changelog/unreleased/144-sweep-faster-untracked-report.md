---
type: changed
issue: 144
---
The size sweep (`node scripts/scorecard-sweep.mjs --only sweep`) loads each view, template and example once and resizes and re-themes it instead of loading a frame per width and theme, runs its share in several browser tabs (`--tabs`, `--frames`), and waits until a frame's elements are defined, its styles applied and its layout has stopped changing instead of polling a node count; `--kinds`, `--filter`, `--widths` and `--themes` narrow a run and `--fresh-frames` is the slow cross-check. `core/site/scorecard/sweep-report.json` is no longer tracked (it went stale with every gallery edit): `--write-report` writes a small summary (cells per metric and the worst item/metric groups) that the Scorecard page reads, and the page says how to produce it when it is missing.
