---
type: changed
issue: 893
---
`PkPageHeader` is generated from its mapping like the other wrappers (the hand-written file is gone); the parameters and the rendered markup are unchanged, plus `Sticky`. The generator gains three mapping options for it: `slotted` (a prop that is also a light-DOM child of its own, here the focusable `pk-heading` title), `json: true` (a typed record list sent as JSON to a string prop, here `Crumbs`) and `unless` (a slot dropped once a list parameter has items: `BreadcrumbContent` only without `Crumbs`).
