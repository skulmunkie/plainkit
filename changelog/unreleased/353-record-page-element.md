---
type: added
issue: 353
---
`pk-record-page` and the `'record'` app-framework page type: one record read as a field list or edited in a validated form beside summary cards. Your `load(id)` and `save(values)` callbacks do the work; the page shows loading, not-found and error states with Retry, marks server errors on their fields, tracks unsaved changes (`dirty`, `pk-record-dirty`) and asks before the tab closes.
