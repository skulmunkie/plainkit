---
type: breaking
issue: 78
---
Three tokens carried names from the application the SDK was extracted from and are renamed, with no deprecated aliases (they were plumbing for the scorecard and the field states, never documented): `--infotip-panel-shadow` is folded into `--shadow-pop` (same value, `0 4px 16px rgba(0, 0, 0, 0.45)`), and `--stat-card-critical-fg`, `--stat-card-warning-fg` and `--stat-card-positive-fg` become `--color-critical`, `--color-warning` and `--color-positive`, which are now defined per theme (dark `#f87171`, `#fbbf24`, `#4ade80`; light `#b91c1c`, `#92400e`, `#15803d`). The scorecard's good, warn and bad text and the field warn and ok states use them; in the light theme the scorecard text is darker than before (the old values were the dark-theme colours in both themes). Replace any use of the old names in your own CSS. A test fails if they return.
