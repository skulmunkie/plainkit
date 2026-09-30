---
type: fixed
issue: 718
---
The conformance-audit CLI's B4 rule ("a `@page` component that does not derive from `PageBase`") no longer fires on an app that has never adopted `PageBase` at all. It now only runs when some other file in the app already declares `@inherits ...PageBase`, real evidence the app opted into that convention, so an app with its own different, valid page-lifecycle pattern gets zero B4 findings instead of one for every page.
