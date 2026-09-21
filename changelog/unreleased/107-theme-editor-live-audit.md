---
type: added
issue: 107
---
The theme editor's Contrast tab is now a live audit: every documented text pair (`AA_PAIRS`, the default for the `pairs` option) in both themes under the current edits, shown as sample text with its ratio and WCAG grade, failing pairs first, with a summary ("2 text pairs below 4.5:1 (1 in dark, 1 in light)"), the count in the tab title, and a jump button for each side of a pair that opens the token in the Tokens tab, in the right theme. The pure logic is `auditPairs` and `auditSummary` in `js/theme-editor-logic.js`. The scorecard's contrast findings on gallery pages are not part of this panel yet.
