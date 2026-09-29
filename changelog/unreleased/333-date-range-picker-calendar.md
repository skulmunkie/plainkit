---
type: added
issue: 333
---
`pk-date-range-picker` takes a `calendar` attribute (Blazor `Calendar`): a calendar button after the fields opens a range `pk-calendar` in a `pk-popover`, sharing the picker's range. Two clicks set the start and the end and close it; focus moves into the calendar and back to the button on Escape. `pk-calendar` gains `focus()`, and `pk-popover` no longer treats a press inside content composed into another element's shadow tree as outside.
