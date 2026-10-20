---
type: added
issue: 1672
---
Blazor `PkScripts`, for the end of `<body>` in the root document next to `<PkStyles />` in the head: one external module script (`plainkit.init.js`, the fingerprinted URL when the app calls `MapStaticAssets`) that starts the `pk-*` elements on the prerendered HTML, so an app has no hand-written `import { initPlainkit }` and the page needs no inline script under a strict CSP.
