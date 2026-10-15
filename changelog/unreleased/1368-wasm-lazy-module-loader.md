---
type: added
issue: 1368
---
A Blazor WebAssembly app can load a module's pages from their own assembly on the first navigation into the module: a module class implements `IPkLazyModule` (the assembly names), the host registers `PkLazyModuleLoader` over the platform's `LazyAssemblyLoader` (the package gains no WebAssembly dependency; Server loads nothing) and hooks the router's `OnNavigateAsync`. A failed download shows the module boundary with Try again, which loads it again. `PkRouteGuard` now throws a loader failure to the boundary, so put `PkModuleBoundary` outside `PkRouteGuard`. New sample host `blazor/samples/PlainKit.AppSample.Wasm`; `node scripts/blazor-browser.mjs` publishes it and checks that the assembly is requested once, on first use. Closes #1368.
