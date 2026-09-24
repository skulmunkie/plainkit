---
type: added
issue: 214
---
A new "Migrating from the class-based components" guide maps every retired compat class (`chip`, `btn-*`, `card-header`, `remedy`, `form-row`, `topbar-back`, and the rest of the vocabulary removed with the class-based components) to its `pk-*` replacement. An opt-in `checkCompatClasses()` in the new `js/compat-warn.js` module scans the document (and later DOM additions) for any element still carrying one of those classes and logs a `warn` naming the replacement, once per class; it is not run automatically and adds nothing to the base bundle unless a page imports it.
