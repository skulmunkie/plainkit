---
type: fixed
issue: 1681
---
`pk-detail-layout` with `sections-above` no longer throws on first render: the observer of the tagged siblings is only used once it exists.
