---
type: breaking
issue: 855
---
The `record` and `list` page types toast their outcomes by default through `ctx.notify`: "Saved" after `save`, "Could not save" (sticky, with the error text) when it rejects with anything but field errors, and after a bulk action "Done" or "Could not complete". Migration: an app that raised its own toast in `save` or `onBulk` deletes it (an identical title within 2 seconds is merged, a different one shows as a second toast) or sets `toasts: false` on that page; `toasts: { saved: 'Order saved', failed: err => err.message, done: false }` words or drops single outcomes (a string, a function of the values or error, or `false`). Without a notify service (`mountPage`) nothing is shown.
