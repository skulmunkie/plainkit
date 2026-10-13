---
type: added
issue: 494
---
`defineModule` accepts and validates `widgets: { key: { load } }` (dashboard widget loaders), and the module host gains an internal, non-public service for the dashboard page (step 2 of the module dashboard, Refs #494); nothing user visible uses it yet, because the dashboard page does not compose from modules until the next step. `mountPage` and the default header search now load on first use, which keeps the app entry graph under its cap with no change in behaviour.
