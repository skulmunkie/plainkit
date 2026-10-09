---
type: changed
issue: 222
---
The `pk-field-group` change event is named `pk-field-change` (it was `pk-change` while the element was new): the group's own event no longer shares a name with the `pk-change` of the controls inside it, which the generated Blazor wrapper needs to tell apart. Its `detail` is unchanged (`key`, `value`, `values`).
