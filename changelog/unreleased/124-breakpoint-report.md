---
type: added
issue: 124
---
The build now writes `dist/breakpoints.report.json`, the analysis of what changes at each named breakpoint: for `phone`, `tablet` and `wide`, every element with the selectors and properties that change at or below it or above it, and any width that is not a named breakpoint. `node core/tools/breakpoint-report.mjs` prints the same as a table (`--json` for the data); the theme editor and the docs will use it to show what moving a breakpoint affects.
