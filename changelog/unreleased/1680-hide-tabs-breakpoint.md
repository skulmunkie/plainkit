---
type: fixed
issue: 1680
---
`pk-detail-layout` with `hide-tabs` now only suppresses its own strip: sections show one at a time only where `tabs-from` says the strip applies (below the collapse width by default), so a wide layout keeps both columns while the host draws the strip.
