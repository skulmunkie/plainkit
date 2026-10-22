---
type: added
issue: 1722
---
`pk-grid` takes the remaining height of its parent with `fill` and shares it between rows with a `rows` track list (`minmax(0, 1fr) minmax(0, 3fr)`), so a dashboard fits the viewport without page scroll; both drop on a phone. `PkGrid` gets `Fill` and `Rows`.
