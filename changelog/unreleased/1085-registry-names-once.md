---
type: changed
issue: 1085
---
`dist/elements/registry.js` lists the element names once and builds the same `{ "pk-x": "./x.js" }` default export from them (about 400 bytes gzip lighter on every page; the page-weight ceilings are lowered by the saving). Importing it works as before; code that read the file as text and parsed the object literal must import it instead. The build refuses an element whose module name is not its tag without `pk-`.
