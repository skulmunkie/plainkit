---
type: added
issue: 392
---
A composition gate: `core/tests/composition-audit.test.mjs` fails on hand-rolled pointer-drag, arrow-key navigation, a hand-built focus trap or a manual interactive ARIA role outside `core/elements/**`, unless it is allow-listed in `core/tools/composition.allow.json` with the issue that promotes it to a core element or utility. `core/STANDARDS.md` documents the rule: nothing is internal-only, and an allow-list entry is a temporary pin, not a permanent exemption.
