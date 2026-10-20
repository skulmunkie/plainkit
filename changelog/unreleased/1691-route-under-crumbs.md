---
type: added
issue: 1691
---
A route can say `under: '/things'` (Blazor: `PkRoute(..., Under: "/things")`): the page context (the trail, the title and the nav row) then read the list above the record without nesting the record route in the list's children, so flat `/things` and `/things/:id` routes give Home > Things > record. `PkPageContext.Compute` and `js/page-context.js` agree on it (shared fixture case).
