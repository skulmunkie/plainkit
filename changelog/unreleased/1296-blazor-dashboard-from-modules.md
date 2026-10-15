---
type: added
issue: 1296
---
A Blazor app can compose a dashboard from what its modules contribute: a module manifest gains `contributes` (the SDK's widget metadata as JSON), a module class implements `IPkWidgets.LoadWidget(key)` for the widget data, and `<PkModuleDashboard Surface="overview" />` renders them through `PkDashboardPage` (tabs, lazy start and per-card errors are the element's). Route curation (`order`, `allow`, `deny`) and the `needs` warning are not carried over yet. Closes #1296.
