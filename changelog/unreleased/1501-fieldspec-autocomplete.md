---
type: added
issue: 1501
---
`PkFieldSpec<TItem>` has an `AutoComplete` property (and the `pk-field-group` spec an `autocomplete` key): the autofill token (`off`, `new-password`, `email`...) goes onto the text, password, email, tel or url control the group draws, so a form keeps its autocomplete settings when it moves to `PkFieldGroup`.
