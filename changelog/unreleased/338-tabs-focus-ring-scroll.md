---
type: fixed
issue: 338
---
The focus ring of a `pk-tab` is no longer cut off at the top and bottom by a scrolling `pk-tabs` strip. The page layer's `[tabindex]:focus-visible` outline offset beat the tab's own `-2px`, so the ring was drawn outside the tab, where the strip clips it; the tab now keeps its ring inside its box.
