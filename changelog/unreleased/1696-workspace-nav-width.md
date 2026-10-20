---
type: added
issue: 1696
---
`pk-workspace` takes `nav-width` (`sm`, `md`, `lg`, `xl` or a CSS length; `NavWidth` in Blazor) for the nav column, and a `pk-tree-item` label that is too long is cut with an ellipsis and shows its full text as a native tooltip instead of clipping or wrapping.
