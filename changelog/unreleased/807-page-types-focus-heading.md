---
type: fixed
issue: 807
---
The built-in `states`, `not-found` and `tool` page types now give the app a level 1 heading to focus after a route change (the state heading, "Page not found" or the new `heading` config key of `tool`), so focus no longer falls back to the main region; the state heading is not drawn twice.
