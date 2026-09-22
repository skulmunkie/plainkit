# Layout builder: design (issue #30)

`mountLayoutBuilder(container, { registry, model, onchange, onsave, blocks })` is a drag-and-drop-style editor for pages, templates, forms and
reusable blocks built from Plainkit elements. This file answers the open questions in the issue, states the guarantees the code is held to, lists
the SDK primitives that are missing and says what ships in which step. It is the reference for `js/layout-model.js` and `modules/layout-builder/`.

## Decisions at a glance

| Question | Decision |
| --- | --- |
| Document model | A JSON tree, rendered live. Not edited DOM. |
| Scope of "pages" (v1) | Layout and content only. No bindings, no event wiring. |
| Preview isolation | Edit surface in the page (inert); the responsive preview in a same-origin iframe. Details below. |
| Persistence and blocks | The host owns both. The builder stores nothing except an unsent draft, and only if the host asks for it. |
| Export | CSP-safe `pk-*` HTML now. Razor is a Blazor-side exporter plugged in through a host hook. |

## 1. Document model: JSON tree, not edited DOM

```jsonc
{
  "version": 1,
  "seq": 7,                              // the next id number: makes ids stable and the operations pure
  "nodes": [                             // the top level: elements only
    { "id": "n1", "tag": "pk-card",
      "props": { "heading": "Hello", "tone": "default" },     // attribute name -> string, or true for a boolean attribute
      "slots": {
        "": [ { "id": "n2", "tag": "p", "props": {}, "slots": { "": ["Some text"] } } ],   // default slot: elements and text
        "footer": [ { "id": "n3", "tag": "pk-button", "props": { "variant": "primary" }, "slots": { "": ["Save"] } } ]
      } }
  ]
}
```

- A **node** is `{ id, tag, props, slots }`. `slots` maps a slot name (`""` is the default slot) to its children; a child is a node or a string of text.
  The issue sketched `{ tag, props, slots, children, text }`: `children` is the default slot and `text` is a string child, so the model has one
  place for content, not three that could disagree. Text is only allowed in the default slot (a named slot is `slot="name"` on an element, and text
  has no place to carry it). A node in a named slot is written with `slot="name"` in HTML.
- `props` are the attributes as written in markup, keyed by attribute name (`show-label`, not `showLabel`). A value is a string, or `true` for a
  boolean attribute; `false` and `undefined` are not stored (the attribute is absent). Numbers are strings, as in HTML; the inspector converts.
  This makes the model and the HTML two spellings of the same thing, which is what makes the round trip exact.
- Ids (`n<number>`) are assigned by the model from `seq`, never reused, and kept by every edit. They are what selection, the structure tree and
  undo point at. They are not exported to HTML unless asked (`toHtml(doc, { ids: true })` writes `data-lb-id`, which the canvas uses to map
  a rendered element back to its node).

**Why a JSON model and not editing the DOM and serialising.**
1. *Validation before rendering.* Every edit is checked against the element API (`dist/elements/api.json`) as data: unknown tag, prop, slot or
   enum value never reaches the page. With DOM editing the elements have already run.
2. *Undo, redo, duplicate, block reuse and diffs are trivial* on immutable data (structural sharing, a command stack of snapshots), and awkward on live
   custom elements that own shadow trees and write to host nodes.
3. *Round trip.* Serialising live DOM leaks what the elements add (`data-*`, `hidden`, reflected defaults, ids); a model holds exactly what the
   author set.
4. *Safe by construction.* The model has no place for a script, a style, an `on*` handler or raw HTML: the serialiser cannot emit them.
5. The Blazor wrapper and other hosts exchange plain JSON.

**Round-trip guarantees** (property-tested on random trees in `core/tests/layout-model.test.mjs`):
- `fromJson(toJson(doc))` equals `doc` (ids included).
- `fromHtml(toHtml(doc, { ids: true }))` equals `doc` including ids; without `ids`, it equals `doc` up to ids (`stripIds`).
- `toHtml(fromHtml(html))` is a fixed point: the second serialisation equals the first. Hand-written HTML is *normalised*, not preserved: whitespace runs
  collapse to one space, leading and trailing whitespace of an element's content is trimmed, whitespace-only text between elements is dropped,
  comments are dropped, attribute order is kept, and the children of one element are grouped by slot (the default slot first, then named slots in first-seen
  order). Nothing else is changed; everything dropped or refused is reported as a problem.
- Validation is deterministic: the same document gives the same problems in the same order.

**Sanitising.** Only tags in the registry (every `pk-*` in `api.json`) or a small allow-list of native content tags (headings, `p`, `div`, `span`,
lists, inline text tags, `a`, `img`, `table` parts, `option`, `br`, `hr`, ...) exist. `script`, `style`, `iframe`, `object`, `link`, `meta`, `base`,
`form` and anything unknown are refused, with their content. No `style` attribute, no `on*` attribute, no `srcdoc`, no `javascript:` or `data:` URL in
`href`/`src`, no attribute the element does not declare (global `id`, `class`, `title`, `lang`, `hidden`, `role`, `aria-*`, `data-*` are allowed).
Limits: depth 32, 5000 nodes, 10 000 characters per value. A problem has `{ code, id, path, message, severity }`.

The checks are the ones the skills tests use for markup (`scripts/tests/skills.test.mjs`, `checkHtml`): real element, real prop, real slot, real enum
value, numbers are numbers, JSON is JSON, no `style` attribute. The model adds: text only in the default slot, child elements of a `pk-*` that declares no
default slot are a warning (text is allowed: code blocks and textareas take text), the HTML content model where markup could not spell the tree (a block inside a
`<p>`, an `<li>` directly in an `<li>`: HTML would close the first element early, so the round trip would break), and the limits above.

## 2. Scope of "pages" in v1

Layout and content: which elements, in which slots, with which static props and text. **Not** in v1: data binding, expressions, event handlers,
routing, conditional content. Reasons: bindings are host-specific (C#, JS, a template language) and would make the model non-portable; the CSP forbids
inline handlers, so an event needs a host-side convention first. The declarative openers (#20: `command`/`commandfor` style attributes) are plain
attributes on buttons and dialogs, so the builder can emit them as ordinary props once they are in the element API; nothing special is needed.
A later phase can add an opaque, host-defined `bind` map per node (`{ "bind": { "value": "Model.Name" } }`) that the model round-trips untouched
and only the host exporter interprets. The v1 model reserves no field for it; `version` is there so it can be added.

Forms are pages: `pk-form`, `pk-field`, `pk-input` and so on are elements like any other, so a form is layout and content plus `name` props.
Templates are pages the host stores; "reusable controls" are blocks (section 4).

## 3. Preview isolation: in the page or in an iframe

**Recommendation: both, for different jobs.**

- **Edit surface: in the page, inert.** The canvas renders the model as real elements inside a container marked `inert`. Inert makes a built page
  non-interactive (no focus, no clicks, no forms, no navigation) so it cannot act on the builder; selection is done by the builder itself, from the
  element rectangles, and shown with an outline. An iframe would make selection, keyboard focus, the structure tree and (later) drop indicators cross a frame boundary
  and duplicate the element loading. The model contains no script, so what a page can do to the builder is limited to CSS and the elements' own document-level effects
  (for example `pk-app-shell`, `pk-dialog`, `pk-toast-stack`); the canvas contains layout with `contain` and the builder shows such elements as ordinary blocks.
- **Responsive preview: a same-origin iframe** (phone 375, tablet 768, desktop): the only way for media queries and viewport units to see the
  device width, and it is real isolation (styles, focus, scroll, unknown element side effects). It loads `plainkit.css` and the elements, and
  renders `toHtml(doc)` (the exported markup, without ids). It is read-only. This is a later step (it is not in phase 2: the in-page canvas
  can only be narrowed with a max-width, and the docs say so).
- Output is always the exported markup, never the live canvas DOM.

Both surfaces work under `script-src 'self'; style-src 'self'`: no `srcdoc` with inline script, no inline style. The frame's document is a static file in the module folder.

## 4. Persistence and reusable blocks: what the host supplies

```js
const builder = await mountLayoutBuilder(container, {
    registry,                 // the element API: an array or a URL of api.json (default: ../elements/api.json next to the module)
    model,                    // a document ({ version, nodes, seq }) or a URL/JSON text: the starting page (default: empty)
    blocks,                   // [{ id, name, nodes: [node] }] the host's reusable blocks (default none; not in the first UI: the option is accepted and logged)
    onchange({ model, reason }),   // every edit, undo or redo; reason: 'insert' | 'move' | 'remove' | 'duplicate' | 'wrap' | 'prop' | 'text' | 'slot' | 'undo' | 'redo' | 'load'
    onsave({ model, html }),       // the Save button and Ctrl+S: the host stores it (a promise is awaited; a rejection is logged and shown)
    onblock({ name, nodes }),      // (later) "Save selection as block": the host stores it and passes it back through setBlocks
    exporters,                // { razor: (model, helpers) => string }: extra export formats, contributed by the host (section 5)
    draftKey,                 // (later) optional localStorage key for an unsent draft; without it nothing is stored
});
```

The builder is a controlled editor: it holds the working document and its undo history, and reports changes; it never fetches or stores a page.
`getModel()`, `setModel(doc)` (loads, validates, logs problems, resets history) and `toHtml()` are the API. `on(event, fn)` returns an unsubscribe function.

**Blocks.** A block is `{ id, name, nodes }`: a list of nodes with ids that are meaningless outside the block. Inserting a block **copies** it into the page with
fresh ids (a page never depends on the block store: it stays valid if the block is renamed, edited or deleted). The host decides sharing and versioning:
shared (a team library) or private (per user) is just which array it passes; versioning is the host's, for example a `version` field it puts on the block
object, which the builder round-trips and ignores. "Linked" blocks (an edit to the block updating pages that use it) are out of scope for v1 and would need a
`ref` node in the model, which `version` leaves room for.

## 5. Export formats

1. **HTML now.** `toHtml(doc)` writes only `pk-*` elements and allow-listed native tags, double-quoted attributes, no inline script or style, no ids,
   two-space indentation, one element per line except inline content. CSP-safe, and the output of `fromHtml` is the input of the same function
   (a fixed point, section 1). Text and attribute values are escaped; the sanitiser in `fromHtml` is the only way HTML enters the model.
2. **Razor after the wrapper generator: a Blazor-side exporter.** The generator exists (#2), and knows how a tag maps to a `Pk*` component, how an
   attribute maps to a parameter (name, C# type, enum member) and which slots are `RenderFragment`s. That knowledge lives in `blazor/`
   (the mappings and the generated manifest); **core does not read it** and gains no dependency on it. So Razor export is a *Blazor-side feature fed
   through the module's host hook*: the wrapper (`PkLayoutBuilder`, a later step) passes `exporters: { razor(doc, helpers) }`, built from its
   mapping data, and the builder exposes it as an export format (`builder.exportAs('razor')`) exactly as it exposes HTML. The hook receives the validated
   document (plain JSON) and `helpers` (`walk`, `escapeText`, `escapeAttribute`); it returns text. The Razor exporter maps each tag to its component
   (`pk-card` to `PkCard`), each prop to its parameter (booleans as bare parameters, enums to their `Pk...` member, numbers and JSON per the mapping), a named slot to a
   `<Name>` render-fragment child, and native tags stay as raw HTML. A tag or prop the mapping does not know is a problem the exporter returns, never silently
   dropped. The same hook serves any other host format (Markdown, a template language).

## 6. Missing primitives (checked against `core/elements`)

The issue's rule: built only from existing components; a gap is flagged and waits, or is worked around visibly. What exists is used: `pk-tree` and
`pk-tree-item` (structure), `pk-tabs` (panels on a phone), `pk-accordion` (via the element inspector), `pk-toolbar`, `pk-button-group`, `pk-button`,
`pk-input`, `pk-select`, `pk-switch`, `pk-textarea`, `pk-field-list`, `pk-empty-state`, `pk-alert`, `pk-badge`, `pk-stack`, `pk-cluster`.
`pk-workspace` and `pk-splitter` exist (resizable panes): they are candidates for the desktop three-pane layout; the smallest UI uses a CSS grid of the three panes
and turns them into `pk-tabs` under 720px.

| Gap | Exists? | v1 handling |
| --- | --- | --- |
| Drag-and-drop / sortable with a drop indicator | No element | **Flagged.** Add and move are by keyboard and buttons (Alt+arrows reorder, in and out; palette buttons insert). A pointer DnD element (`pk-sortable`: a list that reorders by pointer, touch and keyboard, with a drop indicator and `pk-sort` event) is the next step; the operations it needs (`move`) are already in the model. |
| Property grid / form from metadata | No element | **Worked around** in the module: a function that draws `pk-field-list` rows of `pk-input`, `pk-select`, `pk-switch` and `pk-textarea` from a prop's `type`, `values` and `default`. Flagged as a candidate for a `pk-property-grid` element. |
| Canvas selection overlay (outline, handles, drop line) | No element | **Worked around:** the selected node's element gets an outline through an attribute the module's stylesheet styles (tokens only); selection is from rectangles because the page is inert. Handles and drop lines wait for the DnD element. |
| Tree | `pk-tree` exists | Used for structure; selection is shared with the canvas. |
| Resizable panes | `pk-splitter`, `pk-workspace` exist | Used later; v1 uses fixed proportions. |

## 7. Plan

| Step | What | State |
| --- | --- | --- |
| 1 | This document. | done |
| 2 | Phase 1, no UI: `js/layout-model.js` (model, validation, `toHtml`/`fromHtml`, ids, operations, history) and its tests. | done |
| 3 | Phase 2, smallest useful UI in `modules/layout-builder/`: palette from `api.json` with search, inert canvas, selection (click, arrows, tree), structure tree, properties form and element inspector, toolbar and keyboard operations (move, duplicate, wrap, delete, undo, redo), panes become tabs on a phone (`pk-workspace`), HTML export tab, `onchange`, `onsave`, `exporters`; shipped as `dist/modules/layout-builder/` with a page on the SDK site (`site/layout-builder/`). | done |
| 4 | The dev-tools dock entry (a Layout builder panel in `modules/devtools/panels.js`, added to `BUILT_IN`) and the standalone site page (`site/layout-builder/`), reachable from the site's top nav. | done |
| 5 | Not built yet: pointer drag-and-drop (a `pk-sortable` element, its own issue and commit), the iframe device preview, the blocks UI (`blocks`, `onblock`), `draftKey`, the Blazor wrapper `PkLayoutBuilder` and its Razor exporter. | later |

Each step leaves `main` releasable, is tested, and updates the docs and changelog in the same pull request.
