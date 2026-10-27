---
type: changed
issue: 1836
---
Plain light-DOM content elements (`pk-field-list`, `pk-detail-layout`) are no longer hidden until upgrade: their slotted content shows as plain markup before the module loads or with JavaScript blocked. A meta key `"preUpgrade": "visible"` opts an element out.
