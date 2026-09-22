---
type: fixed
issue: 144
---
The scorecard sweep's text-size and touch-target checks now walk into every open shadow root, not only the light DOM and slotted content, so what a `pk-*` element draws for itself (a badge, a help hint, a row template) is measured like any other content; a defined element with a closed shadow root is skipped and logged once instead of missed silently.
