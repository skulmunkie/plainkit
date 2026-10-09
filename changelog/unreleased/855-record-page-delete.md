---
type: added
issue: 855
---
The `record` page type takes an optional `delete(id, ctx)` callback: an existing record gets a Delete button (`pk-record-page` `part="delete"`, event `pk-record-delete`, `config.deletable`), a confirm dialog, then the call, then a "Deleted" toast ("Could not delete" when it rejects). The `routed-pair` template uses it and no longer toasts by hand.
