---
type: fixed
issue: 1509
---
The in-browser suite reports again: adding a Markdown editor to the layout builder no longer freezes the page in a microtask loop, the runner traces every case to a log file and restarts past a case that freezes the page, and the stale 170 s run time is corrected to about 10 minutes.
