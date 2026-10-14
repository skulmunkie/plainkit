---
type: added
issue: 364
---
Blazor apps get a route guard and an error boundary: `PkRouteGuard` asks a module that implements `IPkModuleGuard` whether the reader may see it (a UX guard, authorization stays on the server), runs an optional `IPkModuleLoader` before the module's page renders, and `PkModuleBoundary` shows an error with Try again when a page throws. Fourth step of the Blazor app framework.
