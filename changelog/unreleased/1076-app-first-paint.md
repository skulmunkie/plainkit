---
type: changed
issue: 1076
---
The demo app reaches its first paint about a second sooner on a slow connection: app.html lists its module graph with modulepreload, and the app shell keeps the nav column and its full height while the shell and side nav upgrade, so the page no longer jumps once they arrive.
