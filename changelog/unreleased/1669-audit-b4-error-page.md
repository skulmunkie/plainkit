---
type: fixed
issue: 1669
---
Audit rule B4 no longer fires on a static framework error page (route /error, /not-found or a status code) that injects nothing, loads nothing and has no actions, since it must render without the page lifecycle.
