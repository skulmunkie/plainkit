---
type: changed
issue: 1656
---
`manifest.extras.json` is served only with the tools option (a core-only Blazor app no longer receives it, about 14 KB gzip less); the Custom SDK export still reads it when the tools package is installed.
