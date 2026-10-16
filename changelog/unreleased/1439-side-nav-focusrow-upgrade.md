---
type: fixed
issue: 1439
---
Opening the `pk-side-nav` drawer before its `pk-nav-item` rows have upgraded no longer throws "focusRow is not a function"; the first row takes focus as soon as the rows are defined.
