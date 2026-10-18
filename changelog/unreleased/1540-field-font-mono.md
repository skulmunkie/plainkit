---
type: added
issue: 1540
---
`pk-input` and `pk-textarea` have a `font` prop (`inherit`, `sans`, `mono`) like `pk-text`, so a query, JSON or code field can use the mono font without a class reaching into the shadow tree (Blazor: `Font`).
