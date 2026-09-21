---
type: fixed
issue: 106
---
A native `<input>`, `<select>` or `<textarea>` inside `pk-field` no longer pushes the page wider than its column (two fields in a `pk-field-row` overflowed a 320px phone by 48px): the field's grid column can shrink and slotted controls are capped at its width. The examples were the only place the gallery showed the problem or a blank preview, and are fixed: `pk-dialog`, `pk-drawer` and `pk-command-palette` now include the button that opens them, `pk-field-row` uses `pk-input` (a bare input is 30px tall on a phone), the `pk-button` search-form example labels its input, and the `pk-form` example spaces its fields with `pk-stack`.
