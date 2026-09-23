---
type: added
issue: 222
---
New `core/modules/field-group/field-group.js` (`mountFieldGroup`): renders the `pk-field` + `pk-input`/`pk-select`/`pk-textarea`/`pk-checkbox` block a form otherwise hand-writes per field, from a list of field specs (key, label, hint, kind, required, min/max/step, select options) plus a plain data object — a commit updates the data in place and calls `onChange`; `pk-form`'s own validation needs no extra wiring. `PkFieldGroup<TItem>` is the Blazor equivalent, hand-written (no element of its own, like `PkDataList`): a field's `Get`/`Set` are typed delegates on the model. Neither covers a conditional field or a computed/derived value; those stay hand-written (tracked in #226).
