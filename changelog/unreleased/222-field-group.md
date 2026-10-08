---
type: added
issue: 222
---
`pk-field-group` draws a form from a list of field specs (`fields`) and a `values` object: each spec becomes a `pk-field` with the right control (text and the other `pk-input` types, textarea, select, checkbox, switch, range, combobox), a change updates `values` and raises `pk-change`, and `when` (data, or a `visible(spec, values)` callback) shows and hides conditional fields, which are not rendered while hidden. `js/field-kinds.js` is the shared kind table (`js/page-fields.js` reads it). Form association and `pk-form` support follow in the next steps.
