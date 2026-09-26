---
type: added
issue: 372
---
`createTasks` (js/tasks.js, imported on its own): a task manager that shows long work as progress toasts in the bottom-end `pk-toast-stack`, composed from `pk-toast` and `pk-progress` with no new element API. `tasks.run({ title, details?, blocking?, cancellable?, retry?, timeout?, run(ctx) })` returns `{ id, state, cancel(), retry(), promise }`; `ctx.progress(value, max?)`, `ctx.details(text)` and `ctx.signal`. States queued, running, done, failed, cancelled; a queue with `concurrency` (default 3); a failure stays with Retry, the error text is shown only when `userFacing === true`; the toast is updated in place, throttled (bar 250 ms, details 1 s) and announced politely. `tasks.scope({ busy })` gives a page or module its own scope (unmount cancels cancellable tasks, others continue with their toast), and `createModuleHost({ tasks })` exposes it as `ctx.tasks.run(spec)`. Blazor `IPkTasks` follows in its own step.
