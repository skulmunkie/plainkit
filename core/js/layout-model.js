// The layout builder's document model: a JSON tree of Plainkit elements, checked against the element API, converted to and from safe HTML, edited by pure
// operations and undone by a small history. No DOM, no side effects, no logging: everything returns data (documents and problem lists), so node tests
// cover it and any host (the browser module, the Blazor wrapper, a build script) can use it. The reasoning is in modules/layout-builder/DESIGN.md.
//
//   const registry = createRegistry(api);                          // api: the array in dist/elements/api.json
//   let { doc } = insertNode(emptyDoc(), { node: { tag: 'pk-card', props: { heading: 'Hi' }, text: 'Body' } }, registry);
//   const html = toHtml(doc);                                       // '<pk-card heading="Hi">Body</pk-card>' (indented; { compact: true } for one line)
//   const { doc: again, problems } = fromHtml(html, { registry });  // sanitised: what was refused is listed in problems, what is kept is valid
//   const history = createHistory(doc); history.push(next, 'prop:n1:heading'); history.undo();
//
// A document is { version, seq, nodes }; a node is { id, tag, props, slots }: props map an attribute name to a string (or true for a boolean attribute),
// slots map a slot name ('' is the default slot) to children, a child is a node or a string of text. Text lives only in the default slot. Ids are "n<number>"
// from the document's seq counter, never reused. A problem is { code, severity: 'error' | 'warn', message, id?, path }.
//
// Guarantees (property-tested): fromJson(toJson(doc)) equals doc; fromHtml(toHtml(doc, { ids: true }), { ids: true }) equals doc (the seq counter aside);
// toHtml(fromHtml(html)) is a fixed point; fromHtml always returns a document with no error problems, whatever the input.

// The code is split by concern so each part stays under the per-module gzip budget; this file re-exports all of it (the layout builder module loads it whole).
export { MODEL_VERSION, LIMITS, kebab, createRegistry, valueProblem, normalizeText, emptyDoc, ModelError, errorsOf } from './layout-schema.js';
export { assignIds, walk, locate, findNode, flatten, stripIds, equalDocs } from './layout-tree.js';
export { validateDoc, toJson, fromJson } from './layout-validate.js';
export { toHtml, fromHtml } from './layout-html.js';
export { insertNode, moveNode, removeNode, duplicateNode, wrapNode, setProp, setText, setSlot, createHistory } from './layout-ops.js';
