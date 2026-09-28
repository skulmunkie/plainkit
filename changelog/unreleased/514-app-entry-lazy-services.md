---
type: changed
issue: 514
---
mountApp loads the task, notification and dialog services on first use instead of at startup, so the app entry is about 5 KB gzip smaller (28.6 to 23.8 KB); ctx.tasks, ctx.notify and ctx.dialogs keep their contract, with a stand-in handle for a task or toast asked before the code has arrived.
