---
type: added
issue: 872
---
The `record` page type asks before an in-app leave with unsaved edits: following a link or breadcrumb, or browser back and forward, shows a "Leave without saving?" confirmation (Stay keeps the page, the edits and the address). A Save that navigates on its own is not asked. The router also ignores a back or forward to the address already shown.
