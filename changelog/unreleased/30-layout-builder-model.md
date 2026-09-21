---
type: added
issue: 30
---
`js/layout-model.js` (in `dist/js/`) is the document model of the coming layout builder, with no UI yet: a JSON tree of `pk-*` elements and allow-listed native tags, checked against `dist/elements/api.json` (real tag, prop, slot and enum value, numbers, JSON, no `style` or `on*` attributes, safe URLs), serialised to and from CSP-safe HTML (`toHtml`, `fromHtml`: sanitised, so scripts, styles, handlers and unknown tags never enter the model) and to and from JSON, with stable ids, pure edit operations (insert, move, remove, duplicate, wrap, set prop, set text, set slot) and an undo and redo history. The design, including the round-trip guarantees and the primitives the SDK still lacks (drag and drop, a property grid), is in `modules/layout-builder/DESIGN.md`.
