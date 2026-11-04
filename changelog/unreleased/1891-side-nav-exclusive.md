---
type: changed
issue: 1891
---
**Behaviour change:** `pk-side-nav` now keeps one branch open per level: opening a parent collapses its expanded siblings (their nested state is kept, the filter box is exempt, and a persisted state with several open siblings is reduced on load). Add `allow-multiple` (Blazor `AllowMultiple`) to keep the old behaviour of several branches open at once.
