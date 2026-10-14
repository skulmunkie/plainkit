---
type: changed
issue: 1253
---
The editor files (`custom-elements.json`, `web-types.json`, `vscode.html-custom-data.json`, `elements.d.ts`) carry a one-sentence summary (first sentence, at most 120 characters) for every attribute, method, event, slot and part instead of the full description, and the full text moves to one new file, `dist/descriptions.json`, keyed by `tag.prop`, `tag.method()`, `tag@event`, `tag#slot`, `tag::part` and `tag/--css-property`. The npm package is about 48 KB smaller packed. Tooling that read long descriptions from the editor files should read them from `descriptions.json`; `elements/api.json` and the skills still hold the full text. Refs #1253.
