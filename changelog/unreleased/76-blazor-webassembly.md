---
type: fixed
issue: 76
---
PlainKit.Blazor now works in a standalone Blazor WebAssembly app (verified in headless Chrome with the new `PlainKit.WasmPlayground` sample): the package no longer declares a public `Microsoft.AspNetCore.App` framework reference (it broke restore with NETSDK1082), `PkCircuitState` is a plain class filled by an internal server-only handler (the router's scan of the assembly failed in the browser), and the host environment is read through a helper, so the dev tools page and its Files tool need no server-only type (the page serves in Development, and the Files tool says "No source to browse"). A Blazor Server app is unaffected; a plain class library that used the package's server types now references `Microsoft.AspNetCore.App` itself. The package README, the `plainkit-blazor` skill and its known-gaps reference state WebAssembly as verified, with the limits (AOT and the Web App `InteractiveWebAssembly` mode were not run).
