---
type: fixed
issue: 405
---
The SDK Scorecard's quality check now finds a focus ring drawn by a shadow-DOM component's own `:host(:focus-visible)` rule, so Tab, Tab panel and Tabs (already visibly ringed) no longer score a false `focus-visible` error.
