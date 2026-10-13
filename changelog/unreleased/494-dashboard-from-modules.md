---
type: added
issue: 494
---
A `dashboard` route in an app can name a `surface` and be assembled from what modules contribute: each module lists widgets on its config entry (`contributes`, static data) and loads them from a `widgets` map on the module, so adding a widget edits no dashboard route. Only the tab on screen loads module code, a failing widget shows its own error card with Retry, a denied contribution is never imported, leaving the page aborts every widget's `signal`, and cards reserve their height so nothing shifts as widgets resolve (Refs #494). The demo app's Overview is now such a dashboard, fed by Orders and Reports.
