---
type: added
issue: 592
---
PkDock gets a controlled mode: set `ConfirmLayout` and every resize, tab switch or panel repair holds until your delegate returns the layout to apply (or null to keep the previous one). Unset, PkDock stays free-running, as it was.
