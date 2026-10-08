---
type: changed
issue: 222
---
`mountFieldGroup` (`modules/field-group`) is now a thin wrapper over the `pk-field-group` element: the same call shape (`fields`, `data`, `onChange`, `refresh`, `destroy`, `when` as a function of the data), with the controls in the element's shadow tree instead of the container's own light DOM. The group is form-associated, so a `pk-form` around it validates and lists every field with no wiring. Code that reached into the container for the `pk-field` elements it used to build must go through the `pk-field-group` element (`shadowRoot`) instead.
