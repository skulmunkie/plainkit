---
type: added
issue: 273
---
`pk-accordion-item` and `PkAccordionItem` have an `actions` slot (`ActionsContent` in Blazor): controls in the header, beside the chevron, that do not toggle the section. They sit outside the toggle button, so they are separate tab stops and valid for screen readers.
