---
type: changed
issue: 141
---
The text-size policy names the current elements and parts that carry secondary text (`pk-badge`, `pk-tag`, `pk-divider`, nav group headings and counts, the shell footer, menu descriptions, mini buttons, inline `code`, column headers and more, each with its reason in `META_TEXT`) instead of the classes of the removed class-based components; the tiers are unchanged (reading text 14px, secondary text 12px, and `--text-meta` is 12.04px, 13.02px on a phone). Inline `code` no longer shrinks below `--text-meta` inside small text.
