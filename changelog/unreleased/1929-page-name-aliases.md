---
type: added
issue: 1929
---
Page types converge on shared names without removing any old one: `pk-page-shell` also raises `pk-retry` (next to `pk-page-shell-retry`, the name `pk-states-page` already uses), and the master-detail `load(query, ctx)`, doc `loadItem(id, ctx)` and dashboard `load(key, ctx)` callbacks get an `AbortSignal` as a third argument, aborted by a newer call with the same query, id or key and by leaving the page (as list and record already do). Loaders that ignore it are unchanged.
