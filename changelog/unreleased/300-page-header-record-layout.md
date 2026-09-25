---
type: added
issue: 300
---
`pk-page-header` gets a record layout for phones: a new `tabs` slot docks a tab strip inside the (sticky) header (`TabsContent` in Blazor), and on a narrow container the `record` variant keeps the title and actions on the first row and moves the chips and badges to their own row below (the `page` and `section` variants are unchanged). Slotted `pk-badge` no longer stretches into a circle, and a sticky header is its own stacking context one above in-body sticky strips, so a popover opened from it is not drawn under them. `PkPageHeader` adds `HomeHref`, `HomeLabel` and `HomeIcon` for an icon-only home crumb first in the trail (in the SDK it is an icon-only link with an `aria-label` first in the `pk-breadcrumb`, shown in the record example).
