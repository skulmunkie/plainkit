---
type: notes
issue: 2038
---
Inside `pk-app-shell` pages already sit in the shell body's inline gutter (`--pad-page`, 16px on a phone); the missing gutter was only in the UI review scenarios, whose `rv-page` frame now gives the same inline padding, so cards and focus rings are measured where a real page puts them. A browser case pins the gutter at 375px in both directions.
