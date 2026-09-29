---
type: fixed
issue: 381
---
`pk-nav-item` works as a horizontal bar item inside `pk-navbar` (it detects the ancestry itself, no attribute to set), with the same bottom-bar current-page look as a plain link there. Choosing a `pk-nav-item` row now folds an open `pk-navbar` menu the same way a plain link does (it was silently not closing, since the click landed inside the item's shadow DOM).
