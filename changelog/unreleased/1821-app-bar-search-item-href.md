---
type: added
issue: 1821
---
A `pk-app-bar-search` result with an `href` is a real link: middle-click, Ctrl-click and open in a new tab work, and a plain click still raises a cancelable `pk-select` (preventDefault keeps the host's client routing). `PkAppBarSearchItem` gains `Href`.
