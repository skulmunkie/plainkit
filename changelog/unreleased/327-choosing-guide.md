---
type: added
issue: 327
---
A Guide, "Choosing what to build with", says when to start from a template, a layout, a pattern, an element or a Blazor component and when to write your own: a decision path, a table from page type to starting point, rules for customising a template, the anti-patterns that cost real apps the most (own tables and modals, hand-written `PkField` wrappers, header search, `display: contents` wrappers, `!important`, literal colours, removed utility classes) and how to ask for a missing component. Both agent skills get a "Choose before you build" workflow and a generated `references/choosing.md` built from the guide and the template, layout and pattern catalogue; a test fails when the guide names an element, component, template, layout or pattern that does not exist.
