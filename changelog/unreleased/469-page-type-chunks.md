---
type: changed
issue: 469
---
The built-in app page types (custom, states, tool, settings, not-found, list, dashboard) load on demand from js/app/pages/, so an app fetches only the types its routes use; their behaviour is unchanged.
