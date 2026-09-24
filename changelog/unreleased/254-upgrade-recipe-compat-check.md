---
type: changed
issue: 254
---
Both agent skills' Upgrade recipe gains a step that runs `checkCompatClasses()` in a dev build, so removed CSS classes (which fail silently) reach the checklist.
