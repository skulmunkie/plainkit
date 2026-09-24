---
type: added
issue: 226
---
`mountFieldGroup`'s field specs and `PkFieldSpec<TItem>` gain `when`/`When`, a predicate over the current data that gates whether a field renders at all; it is re-evaluated for every field after each control commits and after `refresh()`, so one field's value can show or hide another. A hidden field's markup is not emitted, so a hidden `required` field never blocks form submission.
