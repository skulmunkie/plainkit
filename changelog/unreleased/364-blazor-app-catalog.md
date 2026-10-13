---
type: added
issue: 364
---
Blazor apps can register their modules with `AddPlainKitApp` (`IPkModule`, `PkModuleCatalog`; a bad or duplicate id throws at startup), and `PkNavModel.Locate` answers the current nav row, breadcrumbs and title for an address, checked against the same fixture as the JavaScript `appLocate`. Second step of the Blazor app framework; the `PkApp` frame follows.
