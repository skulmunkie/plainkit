---
type: changed
issue: 1085
---
`dist/elements/registry.js` lists the element names once and builds the same `{ "pk-x": "./x.js" }` default export from them (about 400 bytes gzip lighter on every page; the page-weight ceilings are lowered by the saving). The exported default object is identical, so code that imports the module is unaffected (hence `changed`, not `breaking`); only the file text differs. Code that read the file as text and parsed the object literal (a regex or `JSON.parse` over the source) must import the module instead; that is the only affected case. The build refuses an element whose module name is not its tag without `pk-`.
