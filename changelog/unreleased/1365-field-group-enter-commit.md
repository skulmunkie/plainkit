---
type: fixed
issue: 1365
---
Pressing Enter in a pk-field-group text field right after typing commits the typed value first, so the record form's save sees it (and pk-field-change reports it) instead of validating the field as empty.
