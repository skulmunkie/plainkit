---
type: added
issue: 523
---
`pk-frame` is a new element: a sandboxed iframe for an inline `html` document or a same-site `src`, with `preset` width caps (`phone`, `tablet`, `desktop`, `full`) from the named breakpoints, a minimal `sandbox` default (`allow-scripts` only, never combined with `allow-same-origin` unless `allow-same-origin` is explicitly set) and a `theme` hand-off (`light`/`dark`) to a cooperating document via a query param and `postMessage`.
