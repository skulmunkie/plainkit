---
type: added
issue: 8
---
New `pk-log`, a streaming log viewer: monospace rows in a `role=log` scroller, `append(...rows)` draws only the new rows, `max` trims the oldest, the view sticks to the newest row until the user scrolls up (`paused`, committed by `pk-pause`) and a 44px `Jump to latest` button resumes. `PkLog` is generated for Blazor (`Rows`, `Max`, `@bind-Paused`).
