---
type: changed
issue: 222
---
`PkFieldGroup<TItem>` is a typed wrapper over the `pk-field-group` element: same parameters (`Fields`, `Model`, `ModelChanged`) and the same specs, but the controls, the conditional rendering, the form value and the validation are the element's. The `pk-field`, `pk-input` and other controls now live in the element's shadow tree, so markup selectors or end-to-end tests that reached them in the page DOM must go through the `pk-field-group` element; `PkForm` validates and lists the group's fields as before. The `When`, `Disabled`, `ReadOnly`, `HelpWhen` and `OptionsSource` funcs are read on every render and sent as data (a field whose `When` is false is not sent at all); `LabelAction` is slotted for its field; `Search` is the element's `search` callback. New public types: `PkFieldDef`, `PkFieldWhen`, `PkFieldSearch` (the element's field spec).
