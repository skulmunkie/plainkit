---
type: added
issue: 222
---
`pk-field-group` is form-associated: a surrounding form gets one FormData entry per shown field (a checkbox or switch only when checked; a hidden or disabled field none; `prefix` submits `name.key`), the first invalid field's message as its validity (a failed submit or `reportValidity()` focuses that field), and a form reset puts the values back to the ones last assigned. `problems()`, `report(on)`, `checkField(key)`, `focusField(key)` and `focus()` are the methods `pk-form` will use to list and show every problem (next step). `messageFor` moves to `js/validation.js` (still exported from `pk-form`).
