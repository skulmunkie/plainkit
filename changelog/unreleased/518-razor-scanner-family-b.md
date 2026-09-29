---
type: added
issue: 518
---
`npx plainkit audit` gains family B (Blazor/Razor only): B1-B6 catch a raw tag with a `Pk*` counterpart, `Class`/`Style` set on a component instead of its own parameters, an unknown component or parameter, a `@page` with no `PageBase`, JS interop duplicating a component, and a `<script>`/inline `onclick`/non-literal `MarkupString` in `.razor`/`.cshtml` files, sourced from `blazor/mappings`. The rules render into both skills' `references/conformance-rules.md` alongside S/D/P/T/A.
