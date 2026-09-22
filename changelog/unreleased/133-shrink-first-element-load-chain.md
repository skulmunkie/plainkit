---
type: fixed
issue: 133
---
A page loads elements sooner: `js/init.js` has `initPlainkit` alone (`js/plainkit.js` still has it plus the dynamic-value, theming and colour helpers, for a page that uses those too), and the "Wire a page" guide adds `modulepreload` hints for the loader, its logger, the element registry and the base every element shares, so the browser fetches them in parallel instead of one round trip at a time. `PkStyles`'s new `Preload` parameter and the Blazor bridge do the same. Measured with `scripts/bench/load.mjs`: a page with one element drops from 17 to 13 requests and from a chain depth of 7 to 4.
