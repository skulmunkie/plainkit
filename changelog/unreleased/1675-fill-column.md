---
type: added
issue: 1675
---
New `pk-fill-column` (Blazor `PkFillColumn`): a column that fills a parent of definite height, such as the `pk-app-shell` body with `contain`; the `fixed` slot keeps its height (`fixed="12rem"`) and the rest fills what is left and scrolls on its own, so a preview above a list needs no wrapper element or `:has()` rule.
