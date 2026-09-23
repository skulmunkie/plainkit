---
type: added
issue: 204
---
New `core/js/page.js` (`createPage`, exported from `plainkit.js`): a page's own state — title, a status/error notice, a busy overlay wrapped around an action, and breadcrumbs — built from elements already on the page (`pk-alert`, `pk-loading-overlay`, `pk-breadcrumb`), instead of every page hand-writing that bookkeeping. Errors go through the SDK's own logger. `PageBase` is the Blazor wrapper: a page `@inherits PageBase` to get `Title`/`Crumbs` (bind into `PkPageHeader`), `SetStatus`/`ClearStatus`/`SetErrorAsync`, and `BusyAsync`, with errors logged through `IPkLog`.
