---
type: added
issue: 222
---
`pk-form` looks through a `pk-field-group` in its form: a stopped submit lists every invalid field of the group in the summary (one line each, the link focuses that field), shows each message in its own field, focuses the first problem, and live validation (blur, input, a field already showing an error) re-checks the one field. `pk-invalid` keeps `controls` (the group once) and `messages`, and adds `problems: [{ key, label, message }]`. Values assigned to a group re-check the messages already showing. Any form-associated element with `problems()`, `report(on)` and `checkField(which)` is looked through the same way.
