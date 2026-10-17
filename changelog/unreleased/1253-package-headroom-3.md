---
type: changed
issue: 1253
---
The npm package is about 8 KB smaller packed. The one-sentence summaries in `custom-elements.json`, `web-types.json`, `vscode.html-custom-data.json` and `elements.d.ts` are cut at 100 characters instead of 120 (the full text is unchanged in `descriptions.json` and `elements/api.json`). In `elements.d.ts` each element's properties now sit in their own `PkXxxProps` interface, which the element interface extends; the JSX and Vue typings use it instead of repeating every property name (the types they accept are the same). In `custom-elements.json` an event whose detail is an object now reads `detail: { name: type }` instead of `detail: [object Object]`.
