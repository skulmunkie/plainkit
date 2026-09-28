# Site V2 and strict module mode: one module anatomy, no custom CSS, no raw markup

Status: proposed design for owner review, not yet planned or implemented. Refs #346 (app framework tracker), #355 to #363 (the site steps), #336 (components the SDK lacks).

## Why

Owner directive: the site (the Gallery App) must be up to par with the new standards. If retrofitting the old site is not the way, build a Site V2 on the latest
standards, elements, controls and modules. Every module implements the same structure. And **strict module mode**: a module has no custom CSS and no custom HTML
markup with standard tags; its markup is only `pk-*` elements, or components composed from other PK elements and located in the module's own components path.

Today the tracker steps (#355 to #361) retrofit the nine pages one at a time, mostly through `moduleFromMount` (an adapter that hands a module a raw DOM host, which by
definition cannot be strict). This document measures how far the current site is from strict, defines the one anatomy and the rules, and decides retrofit versus
from-scratch with numbers. It designs the rule engine so that one engine can later serve this repository's modules and a consumer app (the conformance audit CLI that was
proposed and not built).

## Non-goals

- No implementation. `core/` is not touched by this pull request.
- No change to the page types or the framework contract in `core/js/app/**` other than the two small additions named in section 3 (`pk()`/`defineComponent`, `strict: true`).
- No decision on Blazor beyond noting parity where a rule has a Blazor counterpart (section 3.7).
- The SDK-shipped library modules (`core/modules/*`, the `mountX(container, options)` API consumers use) are not redesigned here; whether they are in scope is open question Q1.

## 1. Measurement: the strict-mode gap today

Method. A throwaway node script (not committed; kept outside the repository tree) walked `core/site/**` and `core/modules/**` on `origin/main` at `00f7077`. Excluded: generated
and data files (`gallery.data.js`, `snapshot.json`, the scorecard baselines and reports, `scoring.data.js`: 159,284 bytes, all under `site/`), `*.test.mjs`, and Markdown
(77,876 bytes: guide sources and design notes). Counts are **heuristic regular-expression counts on comment-stripped source**, in the same spirit as
`composition-audit.test.mjs` and `security.mjs`; they are indicative, not exact:

- *raw-tag creates*: a call `h(...)`, `el(...)`, `create*(...)`, `make*(...)`, `createElement(...)` whose first string argument is a standard tag (`div`, `span`, `p`, `a`, `button`, `ul`, `li`, `table`, `h1` to `h6`, `code`, `option`, `iframe` and about 30 more). Tags with a hyphen never count.
- *raw tags in strings/html*: `<tag` for those same standard tags inside JS strings and template literals, and in `.html` files. The 57 in `code-explorer` include a tokenizer that parses HTML text, so some are false positives.
- *CSS rules*: opening braces in comment-stripped `.css`. *style uses*: `.style`, `style=`, `setAttribute('style'`, `cssText`, `adoptedStyleSheets`, `<style`. *class uses*: `class=`, `className`, `classList`, `setAttribute('class'`, `class:` keys.
- *gz*: gzip of each JS and CSS file, summed (an upper bound for what a user downloads, files are lazy).

| unit | files | JS bytes | CSS bytes | HTML bytes | raw-tag creates | raw tags in strings/html | CSS rules | style uses | class uses | pk-* refs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| modules/code-explorer | 7 | 58,339 | 7,984 | 0 | 1 | 57 | 64 | 1 | 54 | 41 |
| modules/console | 2 | 12,922 | 237 | 0 | 2 | 0 | 1 | 2 | 2 | 30 |
| modules/devtools | 3 | 13,524 | 837 | 0 | 3 | 0 | 5 | 10 | 4 | 16 |
| modules/field-group | 1 | 6,572 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 10 |
| modules/layout-builder | 3 | 43,157 | 4,641 | 0 | 18 | 0 | 29 | 3 | 19 | 42 |
| modules/log-settings | 2 | 10,770 | 320 | 0 | 5 | 0 | 2 | 2 | 4 | 23 |
| modules/logs | 2 | 12,634 | 345 | 0 | 8 | 0 | 2 | 2 | 5 | 29 |
| modules/performance | 2 | 10,741 | 299 | 0 | 4 | 0 | 2 | 2 | 3 | 6 |
| modules/quality | 1 | 4,996 | 0 | 0 | 4 | 0 | 0 | 2 | 4 | 4 |
| modules/scorecard | 4 | 42,215 | 1,322 | 0 | 15 | 33 | 16 | 6 | 21 | 16 |
| modules/theme-editor | 3 | 57,270 | 3,647 | 0 | 90 | 14 | 36 | 14 | 69 | 116 |
| site/(root): shell.js, site.css | 2 | 5,077 | 3,438 | 0 | 4 | 0 | 22 | 0 | 3 | 10 |
| site/devtools | 2 | 582 | 0 | 457 | 0 | 3 | 0 | 0 | 2 | 0 |
| site/files | 2 | 1,654 | 0 | 391 | 0 | 1 | 0 | 0 | 2 | 1 |
| site/gallery (13 js, 2 css, 3 html) | 18 | 80,555 | 12,548 | 2,216 | 24 | 131 | 105 | 14 | 115 | 110 |
| site/guides | 13 | 14,043 | 3,224 | 2,062 | 8 | 15 | 37 | 0 | 16 | 6 |
| site/layout-builder | 3 | 2,126 | 230 | 759 | 0 | 6 | 3 | 0 | 3 | 6 |
| site/scorecard | 4 | 25,317 | 0 | 821 | 3 | 5 | 0 | 3 | 6 | 1 |
| site/settings | 2 | 1,777 | 0 | 1,928 | 0 | 12 | 0 | 0 | 2 | 10 |
| site/spacing | 1 | 0 | 0 | 425 | 0 | 2 | 0 | 0 | 0 | 0 |
| site/theme | 3 | 1,668 | 223 | 804 | 0 | 5 | 3 | 0 | 5 | 3 |
| **subtotal site/** | 50 | 132,799 | 19,663 | 9,863 | 39 | 180 | 170 | 17 | 154 | |
| **subtotal modules/** | 30 | 273,140 | 19,632 | 0 | 151 | 104 | 157 | 44 | 185 | |
| **total** | **80** | **405,939** | **39,295** | **9,863** | **190** | **284** | **327** | **61** | **339** | |

Headline numbers (measured, heuristic):

- 80 hand-written files: 45 JS (405,939 bytes), 15 CSS (39,295 bytes, 327 rules), 11 HTML pages (9,863 bytes); about 154 KB gzip of JS plus CSS across all of it (lazy per page, not one download).
- **Strict-mode violations today: 15 CSS files, 11 HTML pages, 327 CSS rules, 61 style-attribute or style-property uses, 339 class uses, and about 474 raw standard-tag sites (190 created through helpers, 284 written as markup in strings or `.html`)** against a strict target of zero of each.
- The most frequent raw tags: `div` 142, `span` 62, `p` 57, `code` 47, `a` 25, `option` 21, table parts (`td`, `th`, `tr`, `thead`, `tbody`, `table`) about 50, headings `h1` to `h4` and `h6` about 27, `iframe` 7, `button` 6, `form` 2. The work is not exotic: it is mostly layout wrappers (`div`, `span`), text (`p`, `code`, `strong`, headings), links, and table parts.
- Worst offenders: `theme-editor` (90 creates, 69 class uses, 116 pk-* refs: it composes heavily but also builds a lot by hand), `gallery` (131 raw tags in strings, 115 class uses, 105 CSS rules), `code-explorer` (64 CSS rules; itself a custom element with a shadow tree, see 2.7), `scorecard` (48 raw tag sites).
- The demo app is already near strict: `core/tests/app-shell.test.mjs` ("the demo apps and the shell carry no consumer CSS") forbids style, class and stylesheets in `core/samples/app`. Its helper `page.js` still creates `h1` and `dt/dd`, which shows the first two component gaps (section 2.3): a semantic heading element and a field-list that takes data.
- Existing precedent for the machinery: `composition-audit.test.mjs` plus `composition.allow.json` (2 entries), `security.mjs` plus `security.allow.json` (counted sinks), `core/js/quality.js`. The strict rules reuse those shapes (section 3).

Two groups need saying apart. `core/modules/*` (273 KB JS, 151 raw creates) are SDK library modules with a `mountX(container, options)` API, exported for consumers (dist modules, the devtools package idea #162);
`core/site/**` (133 KB JS) is the app. Only the second is an app. Q1 asks what happens to the first.

## 2. Module anatomy: one structure for every module

### 2.1 Folder layout (checked, section 3.3 rule A1)

```
core/site2/                          (provisional path, Q2)
  app.html                           the one host page: <div id="app"> + one script tag (nothing else)
  app.js                             mountApp(document.getElementById('app'), config)
  app.config.js                      brand, modules (lazy `load`), search, footer, theme, storage, legacy keys
  shared/                            components used by more than one module (same rules as a module)
    components/<name>/...
  modules/<id>/
    module.js                        export default defineModule({ id, title, icon, strict: true, nav, routes, state, can })
    pages.js                         the route configs: data only (page-type ids and their configs, callbacks by name)
    components/<name>/
      component.js                   export default defineComponent({ name, props, render })  (2.4)
      component.test.mjs             node test: renders with sample props, asserts the tree
    data/                            static data (json, or js exporting plain objects/functions with no DOM): the module's business logic lives here
    state.js                         optional: the state spec (store.module()) and pure reducers
    module.test.mjs                  node test: defineModule accepts it, every route resolves, nav ids unique, strict check passes
    strict.allow.json                optional: the exceptions (3.5)
  tests/scenarios/                   (or core/tests/review/scenarios/module-<id>*.js, where scenarios live today)
```

Naming: module id `^[a-z][a-z0-9-]{0,39}$` (unchanged), folder = id, component folder = kebab-case name, component tag-independent (a component is a function, not a tag).
Files named `*.css`, `*.html` (other than `app.html`), or any folder not in this list fail rule A1. No `index.js` barrels.

### 2.2 What a page is

A page is a **route entry**: a page-type id and its config. In `pages.js`:

```js
export const home = { page: 'master-detail', config: { /* data + named callbacks */ } };
```

Built-in page types (`list`, `record`, `dashboard`, `tool`, `settings`, `doc`, `workspace`, `master-detail`, `wizard`, `not-found`, `states`) are the vocabulary. A page never contains markup.
Where a page type's slot (for example the detail pane of `master-detail`, the body of `workspace`, a dashboard tile) needs content that config data cannot express, the config names a
**component**: `content: sampleStage` where `sampleStage` is a `defineComponent` result. Page types call `component(props, ctx)` and mount the returned tree in the slot.
The `custom` page type (`config.mount(host, ctx)`) and `moduleFromMount` hand out a raw host and are **forbidden in strict modules** (rule S8), except as counted, ratcheted exceptions during migration.

### 2.3 Styling: tokens, attributes and layout elements only

A strict module has no way to write a style, so spacing and layout come from elements. Existing layout and structure elements (from `core/elements`): `pk-stack` (vertical, `gap`, `align`),
`pk-cluster` (horizontal wrapping, `gap`, `align`, `justify`), `pk-grid` (columns), `pk-toolbar`, `pk-divider`, `pk-splitter`, `pk-card` (titled panel, header/actions/footer, and per the dashboard spec a state machine),
`pk-page-header`, `pk-field-row`, `pk-form-section`, `pk-property-grid`, `pk-field-list`, `pk-text` (paragraph, inline run, variants including `h1` to `h6` looks, `lead`, `eyebrow`),
`pk-empty-state`, `pk-media`, `pk-tabs`/`pk-tab-panel`, `pk-accordion`, `pk-list-group`, `pk-table`, `pk-tree`, `pk-code-view`, `pk-code-block`, `pk-badge`, `pk-tag`, `pk-stat`, `pk-progress`, `pk-alert`, `pk-side-nav`, `pk-navbar`, plus the page-type elements.
Every visual choice is an attribute on those (gap scale, variant, kind, size). Anything that has no attribute is a **component gap**, filed under #336, not solved with a class or a style (`core/STANDARDS.md`, "Composition: check before you build").

Component gaps found while mapping the current site (each becomes an issue linked from #336; the first three block many modules):

| gap | needed by | note |
|---|---|---|
| **pk-heading** (or `pk-text` `level`): semantic h1 to h6 with a decoupled look | every module | `pk-text` says "real headings stay native h1 to h6", which strict mode forbids. Needs `level` (1 to 6) and the `variant` look; renders a real heading in its shadow tree |
| **pk-link**: an anchor that is router-aware (module-relative `to`, external `href`, `target` handled safely, focus ring, `current`) | gallery, guides, files, scorecard | `pk-button` has `href` but is a button look; inline prose links (25 `a` sites) need a text-link element |
| **pk-frame**: sandboxed `srcdoc` or `src` iframe with `title` (required), width presets (phone, tablet, desktop, px), theme and text-scale hand-off | gallery, layout builder, theme editor preview | the gallery's hardest case (3.5). Absorbs `site/gallery/frame.js` |
| **pk-code** or `pk-text inline code`: inline code run | guides, gallery, scorecard (47 `code`) | may be a `pk-text` `code` boolean |
| **pk-swatch**: a colour or token sample with value and contrast label | theme editor, foundations | theme editor draws these by hand today |
| **pk-list**: a plain (un)ordered list with optional marker | prose lists | `pk-list-group` is a card-like list; may be `pk-text list` |
| **pk-field-list** driven by data (`items: [{label, value}]`) | record-like views | the demo's `page.js` builds `dt`/`dd` by hand |
| **pk-scroll-area** / **pk-container** (max width, padding, scroll region) | gallery stage, code view | if `workspace` and `master-detail` panes do not already cover it |
| canvas and dock elements | layout builder | already designed: `2026-09-28-canvas-design.md` (#430), `2026-09-28-dockable-layout-design.md` (#432); the layout builder waits for them |
| select and option lists from data | theme editor (21 `option`) | `pk-select` with `options` data already exists; verify it covers grouped options |

These are estimates of need from the counts above, not final designs; each gap issue gets its own design per the tracker's process.

### 2.4 Components built from PK elements: how they are authored

A component is a function from props to a tree of `pk-*` elements. No raw tags can be written because the builder refuses them. The existing `h(doc, tag, props, ...children)` in `core/js/mount-support.js`
is the ancestor (it is a general helper: it takes any tag, sets `class`, `style` and so on); the strict variant is smaller, not bigger.

**Proposal: two exports of `core/js/app/compose.js`, lazy, not in the entry chunk:**

```js
import { pk, defineComponent } from '@plainkit/core/app';

// pk(tag, props?, ...children) -> a lightweight node description; the host materialises it (so it also runs in node tests without a DOM).
//  tag       must match /^pk-[a-z][a-z0-9-]*$/ (a registered custom element; unknown = a warning naming it), or be another component (a function)
//  props     attributes for strings/numbers/booleans; PROPERTIES for objects/arrays/functions (the element API, the same rule the page types use);
//            `slot` is allowed; `on: { 'pk-change': fn }` binds through ctx.on so cleanup is automatic; `class`, `style`, `innerHTML`,
//            `outerHTML`, `srcdoc` and any `on*` attribute throw
//  children  strings (text nodes, never parsed), numbers, nodes, arrays (flattened), null/false (skipped)
export const sampleStage = defineComponent({
    name: 'sample-stage',
    props: { sample: 'object', width: 'string' },            // a tiny runtime shape check: throws with the component name on a wrong type
    render: ({ sample, width }, ctx) =>
        pk('pk-stack', { gap: 'md' },
            pk('pk-heading', { level: 2 }, sample.title),
            pk('pk-frame', { title: sample.title, width, html: sample.html })),
});
```

Design points:

- `render` is **pure**: it returns a description; the host builds elements from it (`document.createElement` is called in exactly one place, inside `compose.js`), so a static check can forbid `createElement` everywhere else in a module (rule S7) and the description form is testable in node without a DOM (`component.test.mjs`).
- A component may use other components (`pk(otherComponent, props)`) from its own `components/` folder, or from `shared/components/`. A component may not import a component of another module (rule S6): sharing goes through `shared/`.
- Events and state: `ctx` is the page or module ctx (`on`, `store`, `route`, `navigate`, `log`...). Handlers passed in `on:` are registered through `ctx.on`, so unmount removes them and a module cannot leak by forgetting.
- Size estimate: `pk` is about 25 lines and `defineComponent` about 15, so **about 0.5 KB gzip, estimated, not measured**, in its own chunk (the entry chunk budget is untouched). If the owner prefers no new API, the fallback is "components are page-type configs" (a route entry per view) plus the existing `pk-*` elements set by property; this works for read-only views but not for a stage that needs a per-render tree (the gallery), which is why the proposal keeps the small builder. That trade-off is Q3.
- Blazor: a component is a Razor component composed only of `Pk*` components (section 3.7); the rule set carries over.

### 2.5 How modules share components

`shared/components/<name>/` (same shape as 2.1) is the only cross-module path. A component used by two modules is moved there in the pull request that adds the second use (mirrors the composition rule: the second copy is a signal). Shared components may not import from any module. The dependency direction is `modules/* -> shared -> public SDK`. A component used by many apps (not just this site) is a candidate to be an element or a page-type option, and goes to #336.

### 2.6 Data and state

`data/` holds plain data and pure functions (the generated `gallery.data.js` stays generated and is imported read-only). State uses the existing `defineModule({ state })` store spec (namespaced, versioned, validated). No `localStorage`, no `location`, no `history`, no `MutationObserver`, no `document` in a module (the #362 dogfood rules, extended). Existing pure engines that already live in `core/js/*-logic.js` (theme editor, layout model, scoring) are imported through the public entry or through page-type callbacks; they are the part of the old modules that is kept as is.

### 2.7 What stays out of modules entirely

Custom elements with their own shadow tree, such as `code-explorer/element.js` (452 lines), are **elements, not modules**: they move to `core/elements/` (or stay a library package) and the module uses the tag. Same for pointer-drag and arrow-key logic (already covered by the composition audit).

## 3. Strict module mode

### 3.1 Rule list

Each rule: id, rule, rationale, how it is checked. "Module" means a directory under `site2/modules/*` or `site2/shared/*`.

| id | rule | rationale | check |
|---|---|---|---|
| S1 | No CSS: no `.css` file, no `@import`, no `<link rel=stylesheet>`, no `adoptedStyleSheets` / `CSSStyleSheet`, no `<style>` | CSP already forbids inline style; the SDK's tokens and elements are the only styling source | file walk, then a token scan |
| S2 | No style attribute or property: `style=`, `.style`, `cssText`, `setProperty`, `setAttribute('style')`; also `hidden`-toggling done through style | same; visibility comes from element props or page-type state | token scan (comments and strings that are pure text of a guide excluded per file kind) |
| S3 | No `class`, `className`, `classList`, `id`-for-CSS. **No approved utility classes in modules.** Only the framework's own `u-sr-only` remains, inside `js/app/shell.js`, never in a module | `app-shell.test.mjs` already proves the demo needs zero; a needed class is a missing element | token scan |
| S4 | No raw standard tags: no `createElement`/`createElementNS`/`pk()` of a non-`pk-*` name, no `<tag` of a non-`pk-*` tag in a string or template, no `.html` file except `app.html`. Allowed: text nodes, the `slot` attribute, `pk-*` | the directive itself | `pk()` throws at run time (the guarantee); the static scan is the second line |
| S5 | Zero HTML sinks: no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, `createContextualFragment`, `template.innerHTML`, `srcdoc` | the sink count in `security.allow.json` moves to elements and page types, where markup is sanitised once | token scan; `security.mjs` already counts sinks per file, so a module file with a nonzero count also fails the existing test |
| S6 | Imports only from the allowed set: the public SDK entry (`@plainkit/core/app`, derived from `core/package.json` exports and the API baseline), the module's own relative paths (`./`, `./components/**`, `./data/**`), `../../shared/components/**`, and JSON data. Not another module, not `core/js/*` internals, not `core/elements/*` internals | boundaries make the modules movable and the public API real (the #362 rule "imports a non-public core module" generalised) | import-graph scan of `import`/`import()` specifiers |
| S7 | No direct platform access: `document.`, `window.`, `location`, `history`, `localStorage`, `sessionStorage`, `querySelector*`, `addEventListener`, `customElements`, `MutationObserver`, `IntersectionObserver`, `setInterval`, `setTimeout` (use `ctx.after`), `fetch` without `ctx.signal` | framework owns listeners, timers and the DOM; the dogfood test in #362 forbids a subset for `core/site/**` | token scan |
| S8 | Page types: only built-in types and components. No `custom` page type, no `moduleFromMount`, no module-defined `pageTypes`/`layouts` | a raw host defeats S1 to S7; a new page type is an SDK element or page-type PR | static (routes are data, `defineModule` runs in a node test) plus `strict: true` runtime check (3.4) |
| S9 | No literal design values: colour literals (`#fff`, `rgb(`, `hsl(`), lengths with units (`12px`, `1rem`), z-index numbers, font names; values come from element enums | "Tokens only" (`AGENTS.md`) applied to data too | token scan of module source |
| S10 | Anatomy (2.1): required files, allowed folders, no strays, `module.js` default-exports `defineModule({ strict: true })`, ids unique, a component folder has its test | "make sure each module implements the same structure" | file walk plus a light AST-free scan |
| S11 | Every strict module has `module.test.mjs`, at least one scenario (`core/tests/review/scenarios/module-<id>*.js`), and boundary and unmount x100 leak coverage shared through a generic test that iterates modules | tracker section 4 (reliability) | file existence plus the generic test |
| S12 | Size: a per-module JS budget in a baseline file (bytes gzip), ratcheted like `security.allow.json` counts. Never raised | the leanness tenet | build-time measure |

Static-check limits, stated honestly: the scan works on source text with comments stripped and string contents tokenised, not a full parser (the repo has no parser dependency; the existing tools use the same approach).
It can be evaded by determined obfuscation (`window['inner'+'HTML']`); this is a guardrail for agents and contributors, not a security boundary. The real guarantees are runtime: `pk()` refuses raw tags, CSP blocks inline style and script, and page types own every sink. Whether to take a dev-only parser dependency for tighter checks is Q6.

### 3.2 Exceptions: an allow-list per module, counted and ratcheted

`modules/<id>/strict.allow.json`:

```json
{ "exceptions": [
  { "rule": "S8", "file": "pages.js", "count": 1, "reason": "Layout builder canvas mounts a design surface until pk-canvas lands.", "issue": 430 }
] }
```

- `reason` is required, at least 20 characters; `issue` is required and must be an open issue number that promotes the exception away (same discipline as `composition.allow.json`: "an entry is a temporary tracking pin").
- `count` is exact: fewer real hits than `count` fails too ("lower the count"), more fails ("add an exception or fix it"), so numbers only go down, like `security.allow.json`.
- A global `core/tools/strict.baseline.json` holds the total exception count per rule; the test fails if the total rises. At Site V2 cutover the target for the total is **0**, except the ones the owner names in Q4.
- An exception file with no matching hit, or an exception for S3 or S4 with no issue that names a component gap, fails.

### 3.3 Where the checks live and how they fail

- **One engine, pure**: `core/tools/strict/engine.mjs` exports `checkFiles(files, options)` where `files` is `[{ path, text }]` (no filesystem, no globals) and `options` is `{ ruleset, allow }`. It returns findings `{ rule, file, line, message, fix }`. Rules are objects `{ id, applies(file), scan(file) }`.
- **Node test**: `core/tests/strict-modules.test.mjs` reads `site2/modules/*` and `site2/shared/*`, calls the engine with `ruleset: 'module'`, and asserts no finding beyond the allow-lists; it also proves each rule on an in-memory violating file (the same "fails on a deliberately added violation" evidence the #362 issue asks for, but permanent because the fixture is a string, not a temporary commit).
- **Verify integration**: one new entry in the `CHECKS` table of `scripts/verify.mjs`, group `node` (runs in the existing node group, under 5 s budget): `strict-modules`.
- **CLI (later, section 3.6)**: `node core/tools/strict/cli.mjs <dir> [--ruleset consumer|module] [--json]`.

FIX-line messages, in the style of `scripts/verify.mjs`:

- S1: `FIX: <file> has CSS of its own (<what>). A missing style is an SDK gap: use a layout element (pk-stack, pk-cluster, pk-grid) or an attribute, or file the gap under #336. Never add CSS to a module.`
- S3: `FIX: <file>:<line> sets a class. Modules have no class hooks: use the element's variant/kind/size attribute, or file a component gap (#336).`
- S4: `FIX: <file>:<line> creates or writes a <div>. A module's markup is only pk-* elements: use pk('pk-stack', ...) / pk-text / pk-heading / pk-link, or a component in components/. Missing element? File it under #336 with the exact tag you needed.`
- S5: `FIX: <file>:<line> is an HTML sink (innerHTML). Markup comes from an element or page type that sanitises it (pk-doc-page article, pk-frame html); a module passes data as text or a property.`
- S6: `FIX: <file>:<line> imports <spec>. Allowed: the public SDK entry, this module's ./components ./data, and ../../shared/components. Move shared code to shared/components/ or ask for a public export.`
- S8: `FIX: <route> uses the custom page type / moduleFromMount. Strict modules use built-in page types with components. Track the missing capability (#336) and, until then, list it in strict.allow.json with the issue.`
- S10: `FIX: <module> breaks the anatomy: <missing file or stray folder>. Run node scripts/new-module.mjs <id> for the skeleton (proposed, section 4.6).`
- ratchet: `FIX: strict.allow.json for <module> lists <n> <rule> exceptions but <m> remain: set count to <m> (numbers only go down), or delete the entry.`

### 3.4 Is it also a `defineModule({ strict: true })` flag?

Yes, as a small marker with two real effects, not as the enforcement:

1. `defineModule` and the host reject a strict module whose routes use `custom`, or which declares `pageTypes` or `layouts` (rule S8, pure, runs at definition and again at lazy import: a strict module cannot skip it).
2. Devtools and the module scorecard read the flag (show "strict", list its exceptions), and the static engine requires it in `module.js` (S10) so a module cannot silently opt out.

Everything else (S1 to S7, S9) is static analysis plus `pk()` refusing raw tags at run time. A fully runtime sandbox is not possible in a browser module, so the flag stays small (about 10 lines in `module.js`, estimate).

### 3.5 How strict rules apply to the gallery's hardest case

The gallery shows arbitrary example HTML strings (the `html` of each sample from element meta and sample folders, in generated `gallery.data.js`, 159 KB of generated data across the site), runs each sample's boot script, and switches between phone and desktop widths. A strict module cannot write `srcdoc` (S5) or an `iframe` (S4). Resolution:

- The sample renders through **a `pk-frame` element that is part of the SDK** (`core/elements/frame/`, component gap above). It is the *only* place that touches `srcdoc`; its sink is counted in `security.allow.json` like any element's. The module passes data: `pk('pk-frame', { title, html, script, width, theme, scale })`.
- The HTML strings are **repository-authored and generated at build time** (`tools/gallery-dist.mjs` reads sample files); no runtime or user input is interpolated (as `security.allow.json` already says for `preview.js`). The frame therefore has a `trusted` boolean (default `false`): untrusted content is sandboxed without scripts; trusted content, which the gallery must use because the samples run behaviour, is same-origin and run with scripts, as `frame.js` does today. Because `srcdoc` inherits the parent's CSP, the boot script is an external same-origin URL chosen from an allow-list (`boots/`), never an inline script, exactly as today.
- The layout builder's canvas and the theme editor's preview are the same case (render user-arranged markup); they use `pk-frame` too, or the canvas element (#430).
- Code and property panes use `pk-code-view`, `pk-code-block` and `pk-property-grid`. Everything else in the gallery is composed: navigation is `master-detail` with `pk-tree` (the nav rule in `nav.js` says the side nav is structure, so the 100-plus element entries are a tree in the master pane rather than side-nav items), element pages are `pk-tabs` of components.
- Honest gap: `pk-frame` must exist before the gallery module can be strict; until then the gallery is the one module that would carry the `pk-frame`-gap exception (S4 and S5), each pinned to that issue.

### 3.6 Consumer strict mode: one engine for two audiences

The engine is a set of rules over `{ path, text }` files with a **ruleset** that only differs in configuration, so the same code serves a future `plainkit` audit CLI:

| rule | ruleset `module` (this repo) | ruleset `consumer` (strict, opt-in) |
|---|---|---|
| S1 CSS files | error | error (option `allowCss: ['app.css']` for apps that must keep some) |
| S2 style props, S3 class | error | error (option `allowClasses: [...]`) |
| S4 raw standard tags | error, no exceptions besides allow-list | error, plus a hint table "you wrote `<button>`: use `pk-button`", "`<table>`: pk-table" (the duplication detector: a table from tag to element from the element manifests) |
| S5 sinks | error | warning by default |
| S6 imports | the site's allowed set | configurable: `imports: ['@plainkit/core', './lib/**']` |
| S8 page types | built-in only | warning: "this route hand-builds a list; use the `list` page type" (wrong page-type use, needs route config) |
| S9 literal values | error | error, with the consumer's own token file allowed |
| S10 anatomy | the module layout | off |

What needs to be true now so the consumer CLI is cheap later: the engine stays pure (no fs, no repo paths); rule messages carry `fix` text; the element-hint table is generated from the same `*.meta.json` the docs use; rules are additive; and the module-only rules (S6 allowed set, S10, S11) are options, not code. The consumer CLI itself is out of scope here (Q7).

### 3.7 Blazor counterpart

Razor markup in a strict app module contains only `Pk*` components and components under the module's `Components/` folder; no `class`, no `style`, no raw HTML tags. The same engine rules apply with a Razor scanner (a follow-up; the `.razor` files are checked by the ruleset's tag rule). A Blazor module is a Razor class library with the same layout (`Components/`, `Pages/`). Noted as Q8 because the tracker's Blazor parity steps are still open.

## 4. Site V2 plan

### 4.1 Retrofit or from scratch: decision

**Recommendation: build Site V2 from scratch in a new tree (`core/site2/`), reusing the pure engines and data, and delete V1 at cutover.** Not a retrofit of the nine pages.

The numbers behind it:

- The strict gap is structural, not local: 474 raw-tag sites, 339 class uses, 327 CSS rules and 61 style uses sit in 45 JS, 15 CSS and 11 HTML files. Every module's view layer is written as DOM plus CSS, so making one strict means rewriting its view layer, not editing lines.
- The tracker's retrofit steps (#355 to #360) reach most modules through `moduleFromMount` first (one line, "before they are ever rewritten"), which is a `custom` page type: non-strict by rule S8. Retrofit therefore rewrites twice (adapter, then real rewrite). #357 already records that a parity port of `guides` nets about -2.8 KB.
- A retrofit changes a live page in every pull request (visual risk on the published site, each needing screenshots and scenarios). V2 lives beside V1 and is compared to it.
- What is kept: the logic. Theme, layout, scoring, log, perf, palette and history logic are already pure `core/js/*-logic.js` files (about 40 files); `scorecard/measure.js`, `code-explorer/symbols.js`/`tokenize.js`/`providers.js`, the guides content and `guides-search.js` data adapter move into `data/` unchanged.
- Size, estimated: V1 hand-written = 6,820 lines across 80 files (JS, CSS, HTML). The tracker's audit targets 2,362 code lines for the modules alone under the *loose* leanness rule. Strict removes the 39 KB of CSS and 10 KB of HTML entirely and turns view code into `pages.js` config plus small components. **Estimate (not measured): V2 lands at 3,000 to 3,800 lines across the same domain, with zero CSS and one HTML file, and about 35 to 45 percent less gzip JS+CSS than V1's 154 KB**, because every raw-DOM builder becomes an element the SDK already ships. The estimate has high uncertainty on the gallery, the theme editor and the layout builder (about 60 percent of the code) and should be re-measured after step V2-4.

What this does not save: the SDK additions in section 2.3 are real work and precede several modules. Honest cost: V2 needs about 10 component-gap elements before the last modules can be strict; V1's retrofit path would just leave those hand-rolled forever. That is the point of the directive.

### 4.2 Target modules and page types

| module | page type | components needed | SDK additions first | notes |
|---|---|---|---|---|
| settings | `settings` | none | none | fields from config: theme, text size, sample width, `log-settings` as fields. Smallest; first proof |
| devtools | `tool` with tabs, each tab a `dashboard`/`list`/`tool` | log table, perf tiles | `pk-heading`, `pk-link` | rebuilds `devtools`, `console`, `logs`, `log-settings`, `performance`, `quality` as pages, not `mountX` |
| guides | `doc` | none | `pk-doc-page` additions per #357 (router hooks) | already a page type; data adapter and search index reused |
| files | `master-detail` (tree + `pk-code-view`) | code viewer | `code-explorer` as an element or `pk-tree` + `pk-code-view` composition | if `code-explorer` becomes an element (2.7), the module is about 20 lines |
| scorecard | `dashboard` composition (PR #502 held) | sections, stat tiles, finding rows | dashboard widgets (`pk-card` state machine) | measurement engine (`measure.js`, `sections.js`) is data/logic |
| theme | `workspace` (controls | live preview) | colour-input rows, swatches | `pk-frame`, `pk-swatch`, grouped select | biggest DOM count (90 creates) |
| layout builder | `workspace` (palette | canvas | properties) | tree of nodes, property editor | `pk-canvas` (#430), `pk-dock` (#432), `pk-frame` | last; blocked by two designs |
| gallery | `master-detail`: nav tree, detail = element page (`pk-tabs`: Preview, API, Source, A11y), foundations, patterns, templates | sample stage, prop table, token table | `pk-frame`, `pk-heading`, `pk-link`, `pk-code`, `pk-swatch` | largest module (12,548 B CSS, 131 raw tags); split into `gallery-elements`, `gallery-foundations`, `gallery-templates` routes of one module |
| console/logs | inside devtools | | | not separate top-level modules |
| spacing | folded into gallery foundations | | | one HTML file with no script |

### 4.3 Coexistence and cutover

- V2 is a separate directory and entry (`site2/app.html`) served next to V1. `dist` and the site build publish both. A banner on V1 links to V2 once modules reach parity (optional).
- URL compatibility is the tracker's design unchanged (Q1 in #346): generated redirect stubs plus module `aliases`, so `guides/index.html#/<guide>` and `gallery/index.html#/elements/pk-button` keep working. Stubs are generated only when V2 owns that route; until then V1 answers.
- Parity gate per module before its V1 page stops being the canonical link: screenshots (V1 vs V2 at 1280 and 375, light and dark) attached, scenarios green, `ui-review` errors zero, the CLS, leak and boundary cases from the tracker passing, and a deep-link table for that module verified.
- Delete V1 (#361) only after every module is at parity and the outside links table is verified: remove `core/site/**` pages, `shell.js`, `PAGES`, the nine HTML pages; rename `site2` to the final path in one mechanical pull request; update scorecard file lists, README and guides. Until then V1 stays untouched so the live site never regresses.

### 4.4 Testing per module

Per module (from the tracker section 4 and 6, each as measuring cases, not sentences): a scenario for each state a still shot cannot show (menu open, nav collapsed, deep link, empty and error boundary, phone width, right-to-left where relevant), a browser case for each layout expectation, the mount/unmount x100 leak case (generic, iterating `modules`), a CLS 0 case on module switch, an error-boundary case, `component.test.mjs` per component, and the strict engine run. Budgets: no existing budget raised; per-module JS budget in the baseline (S12); V2 entry JS at or below the tracker's entry budget (proposed 6 KB gzip, 4 KB target, still Q6 of #346).

### 4.5 Migration order and risk

1. Foundation: engine, `pk()`/`defineComponent`, `strict: true`, module skeleton generator, `settings` and `devtools` shell (risk: low; proves the anatomy and the check).
2. `guides` (low: already a page type, data reused), `files` (low if the explorer stays an element).
3. `scorecard` (medium: waits for dashboard composition, PR #502), then `theme` (high DOM volume, medium risk).
4. `gallery` (highest risk and value; needs `pk-frame`, `pk-heading`, `pk-link`, `pk-code`, `pk-swatch`).
5. `layout builder` (blocked by #430 and #432; can stay V1-only as the documented last exception).
6. Cutover and V1 removal (#361), docs (#363).

### 4.6 Implementation breakdown (each at or under about 400 hand-written lines, one issue = one branch = one PR)

| PR | scope | depends on | est. lines |
|---|---|---|---:|
| V2-0 | this design (docs) | none | docs |
| V2-1 | strict engine (`core/tools/strict/engine.mjs`), rules S1 to S9 as pure rules, unit tests with in-memory violating files | none | 380 |
| V2-2 | `pk()`, `defineComponent`, `strict: true` flag, node tests (no DOM), API baseline, docs | V2-1 | 250 |
| V2-3 | allow-list and ratchet (`strict.allow.json`, `strict.baseline.json`), `strict-modules` in `scripts/verify.mjs`, FIX lines, S10/S11 | V2-1 | 300 |
| V2-4 | `site2/` skeleton (`app.html`, `app.js`, `app.config.js`), the module generator, `settings` module | V2-2, V2-3 | 250 |
| G-1..G-n | one PR per component gap element (`pk-heading`, `pk-link`, `pk-frame`, `pk-code`, `pk-swatch`, `pk-list`, data `pk-field-list`), each with meta, gallery, skills, Blazor mapping | independent | 250 each (estimate) |
| V2-5 | `devtools` module (with `logs`, `console`, `perf`, `quality` pages) | V2-4, G heading/link | 350 |
| V2-6 | `guides` module (needs the `pk-doc-page` additions of #357) | V2-4 | 200 |
| V2-7 | `files` module (and `code-explorer` to an element, split into its own PR if larger) | V2-4 | 250 |
| V2-8 | `scorecard` module on the dashboard composition | V2-4, PR #502, dashboard widgets | 380 |
| V2-9 | `theme` module | V2-4, G swatch/frame | 400 |
| V2-10 | `gallery` module, split into three PRs: elements pages, foundations, patterns/templates | V2-4, `pk-frame`, G heading/link/code | 3 x 350 |
| V2-11 | `layout builder` module | #430, #432, `pk-frame` | 400 |
| V2-12 | cutover: redirect stubs, alias table, banner (this is #361's entry, re-scoped) | V2-5..V2-10 | 300 |
| V2-13 | remove V1 (`core/site/**`, `shell.js`, nine pages) and rename `site2`; docs (#363) | V2-12 | deletion plus 150 |

Small on purpose: the first four PRs have no user-visible change, which lets the anatomy and the check be reviewed before any module depends on them.

## 5. Impact on existing issues

| issue | now | proposal |
|---|---|---|
| #355 Site 1 (entry, settings, devtools, stubs) | retrofit with `moduleFromMount` | **re-scope**: becomes V2-4 and V2-5 (skeleton, `settings`, `devtools` as strict pages); redirect stubs move to V2-12; drop the `moduleFromMount` step |
| #356 Site 2 (files, theme, layout builder) | adapter-first retrofit | **re-scope and split**: V2-7, V2-9, V2-11; layout builder waits for #430/#432 |
| #357 Site 3 (guides on doc page type) | port nets about -2.8 KB, needs `pk-doc-page` additions and a router | **keep, re-scope** to V2-6: do it in the strict V2 module (the owner declined non-reducing retrofits in #391 and #401; in V2 the gain is strictness, not bytes, so it needs the owner to accept that criterion: Q5) |
| #358 Site 4 (module scorecard) | dashboard page type | **keep** as V2-8; depends on PR #502 |
| #359, #360 Site 5 to 6 (gallery) | retrofit in two steps | **supersede** by V2-10 (three PRs) after `pk-frame` and the gaps |
| #361 remove shell.js, PAGES, nine pages | delete after 359/360 | **keep, re-scope** to V2-12 and V2-13 (cutover, then removal) |
| #362 enforcement (agent working on `agent/362-framework-enforcement`) | dogfood test on `core/site/**` | **coordinate**: keep its rules (framework-code in site, per-module line targets, framework size budgets, no-polling grep for `core/js/app/**`), but re-target the site rules to `site2/` and let the strict engine own S1 to S9. Do not duplicate: #362 owns the framework budgets and `core/js/app/**` checks, V2-1/V2-3 own module rules. Its "per-module line targets" is replaced by S12. I could not find an open pull request for #362 at the time of writing (no `agent/362-*` PR listed), so this is to reconcile when it appears |
| #363 docs (build-an-app guide) | teaches `defineModule` with `custom` pages | **re-scope**: teach the strict anatomy and `pk()`; add a "strict mode for your app" section once the consumer ruleset ships |
| #336 tracker | gaps list | **add** the gap items of 2.3 as checklist lines |

## 6. Open questions for the owner

Decisions I cannot make for the owner:

- **Q1. Library modules (`core/modules/*`).** These 273 KB are the SDK's `mountX` API for consumers, not app modules. Options: (a) V2 rebuilds their views as strict pages and the `mountX` API is frozen then deprecated in a later major; (b) they stay as library code out of strict scope, and only the site's own use of them stops; (c) they move into V2 and are deleted at the next major. This changes the V2 size, the API baseline and the versioning story. Which?
- **Q2. Path and name of V2.** `core/site2/` is provisional. Rename to the final path at cutover (one mechanical PR), or build directly at `core/apps/gallery/` and keep V1 at `core/site/` until deleted?
- **Q3. `pk()`/`defineComponent`.** Approve a new small public API (about 0.5 KB gzip, estimated) with the names `pk` and `defineComponent`, or prefer components as page-type configs only (no builder; the gallery's stage then needs a `pk-frame`-plus-config page type instead)? Names are public API.
- **Q4. Exceptions at cutover.** Is zero exceptions the target, or may a named few remain (for example the layout builder canvas until #430)? And is it acceptable to ship V2 modules with `S4`/`S5` exceptions pinned to open gap issues (`pk-frame`, `pk-heading`), given the ratchet?
- **Q5. What is V2's parity and reduction criterion?** The owner declined non-reducing retrofits (#391, #401). V2 modules are justified by strictness and structure, not bytes; my estimate is a reduction overall, but per module it may not be (guides). Do you accept "strict and consistent, no larger than V1 gzip in total" as the criterion, and is a per-module non-reduction allowed?
- **Q6. Parser dependency.** Static checks by text scan are evadable; a dev-only parser dependency (for example acorn) would make S4 to S7 exact, and would be needed for a robust consumer CLI. Accept a dev dependency, or stay dependency-free?
- **Q7. Consumer conformance CLI.** Do you want the audit CLI (`--ruleset consumer`) scheduled after V2-3, shipped in the npm package and skills, or only kept as a design constraint for now?
- **Q8. Blazor.** Should the strict rules and module anatomy be mirrored for Razor modules in the same effort, or after the JS side lands?
- **Q9. `id` and `data-*`.** I allowed `id` (as an attribute string, for `aria` links) and `data-testid` in modules and forbade `class` and `style` outright. Confirm, or forbid `id` too.
- **Q10. Guides content and generated data.** `gallery.data.js`, guide Markdown and scoring data are generated or content, not module code. Confirm they are exempt from S1 to S9 (only their consuming source is checked).
- **Q11. Cutover of external URLs.** The tracker's Q1 (generated redirect stubs acceptable) still applies; confirm, since V2-12 depends on it.

## 7. Verification of this document

- Measurement reproduced by the script kept outside the repository (scratchpad); numbers above are from that run on `00f7077`. Classification counts are heuristic and should be re-run with the final engine (V2-1) as the real baseline (`strict.baseline.json`); the engine's first run will differ from these regex counts.
- Estimates labelled "estimate" (lines, gzip savings, API size, PR sizes) are not measured.
- Checked in the repo: the module contract (`core/js/app/module.js`), the demo app (`core/samples/app`) and its no-consumer-CSS test, `composition-audit.test.mjs`, `security.allow.json`, the layout and structure element list, the existing specs.
