---
type: fixed
issue: 554
---
`--color-border` in the dark theme is now visibly distinct from `--color-surface` (it matched exactly, at `#3a3a3a`, so any element framed by a 1px `--color-border` outline on a surface — such as `pk-dock` — was invisible); it now uses the same `#505050` step as `--color-input-border`.
