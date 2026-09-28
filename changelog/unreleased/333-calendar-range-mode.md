---
type: added
issue: 333
---
`pk-calendar` has an opt-in range mode: add `range` and the first click sets `start`, the second sets `end` (swapped when earlier). The days between are highlighted, a pending range previews under the pointer or focus, `min` and `max` are respected, Escape drops a pending start, and `pk-range-change` raises `{ start, end, valid }` like `pk-date-range-picker`. A polite live region announces each step. In Blazor, `PkCalendar` gains `Range`, `Start`, `End` (both bindable) and `OnRangeChange`.
