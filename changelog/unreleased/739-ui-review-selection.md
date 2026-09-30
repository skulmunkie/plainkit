---
type: changed
issue: 739
---
The UI review selects the elements a pull request changes plus the elements that compose them, and skips a `meta.json` edit that only touches a non-rendering field (`tier`, `group`, `summary`). `manifest.json` gains `reasons`, saying for each element whether it was changed, a dependent or selected by a base change.
