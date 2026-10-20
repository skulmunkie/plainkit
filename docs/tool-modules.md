# Plainkit tool modules (moved out of core/README.md)

The dev-tool modules are a separate download and are not in the npm package, so their documentation lives here, not in the package README.

## Tool modules: code explorer, scorecard, theme editor, performance, console, logs, log settings, dev tools

Each tool ships as a JavaScript module in `dist/modules/<tool>/` with one function, `mountX(container, options)`, that you call from your own page. The document needs no setup beyond the module: it adds `dist/plainkit.css` if it is not already loaded (it styles the whole page, like any SDK page).

### The two units: runtime and modules

The build makes two units, each with its own manifest (sizes and SRI hashes) and its own release zip:

| Unit | Folder | Manifest | Release asset | Holds |
| --- | --- | --- | --- | --- |
| Runtime SDK | `dist/` (without `modules/`) | `dist/manifest.json` (+ `dist/manifest.extras.json` for the files the npm package leaves out) | `plainkit-dist-<version>.zip` | `plainkit.css`, `plainkit.min.css`, `plainkit.js`, `js/`, `elements/`, `icons.svg`, the gallery, the editor-support files (the agent skills are not in `dist`: the Pages site serves them at `skills/`) |
| Dev-tool modules | `dist/modules/` | `dist/modules/manifest.json` | `plainkit-modules-<version>.zip` | one self-contained folder per tool: code-explorer, console, devtools, layout-builder, log-settings, logs, performance, quality, scorecard, theme-editor |

A page that only uses `pk-*` elements needs the runtime zip and never fetches a module. The modules zip has `modules/` at its top: unzip it into the runtime folder and it lands at `dist/modules/`. The unit sits two folders below the runtime root, as `modules/<tool>/` sits two folders below `core/` in the source, so a module's imports (`../../js/log.js`) and its page stylesheet (`../../plainkit.css`) are the same text in both places. A module names the runtime by these relative paths and nothing else.

**Hosting the modules apart from the runtime** (the modules on one origin or folder, the runtime on another): the scripts' own imports are remapped with an import map, and the runtime's assets (`plainkit.css`, `elements/api.json`, the release files the theme editor exports) are named once with a meta tag. Both are read by the browser, so there is nothing to rebuild:

```html
<meta name="plainkit-runtime" content="https://cdn.example/plainkit/dist/">
<script type="importmap">{ "imports": { "https://tools.example/dist/js/": "https://cdn.example/plainkit/dist/js/" } }</script>
```

(With the modules at `https://tools.example/dist/modules/`, their `../../js/` resolves to `https://tools.example/dist/js/`: that trailing-slash key is what the import map remaps.) The modules still make only same-origin reads unless you configure this, and each unit's manifest is what you pin (`integrity`) against. The theme editor's Custom SDK export reads the runtime manifest and, when it is reachable, `modules/manifest.json`, and rewrites each unit with its own recomputed manifest.

Blazor: PlainKit.Blazor packs both units under `_content/PlainKit.Blazor/plainkit/` (`plainkit/modules/<tool>/` is where the `PkDevTools`, `PkThemeEditor`, `PkLogs`, `PkLogSettings`, `PkPerformance`, `PkConsole`, `PkQuality`, `PkScorecard` and `PkCodeExplorer` wrappers import them from); `scripts/check-package.mjs` asserts they are there. The npm package (`plainkit`) is the runtime only.

### Code explorer

```js
import { mountCodeExplorer } from './dist/modules/code-explorer/code-explorer.js';
const explorer = await mountCodeExplorer(document.getElementById('code'), { snapshot: 'code.json', file: 'src/app.js', line: 12, search: 'TODO', theme: 'light', height: '32rem' });
```

Options: `snapshot` (URL of a snapshot JSON, or the parsed object), `provider` (a ready provider instead), `file` and `line` (open that file, focus that row), `search` (run a query: text or /regex/), `theme`, `height` (any CSS length or `fill`). Returns `{ element, openFile(path, { line }), search(query), destroy() }`. Make a snapshot of your own folder with `node tools/snapshot.mjs <folder> <out.json>` (text files only, no `node_modules`, `.git`, `bin`, `obj` or `dist`); the format is described in `js/code-explorer/providers.js`. The SDK's own Files page is a host on this module. There is no `pk-*` element: the existing `<code-explorer>` element already is one.

### Scorecard

```js
import { mountScorecard } from './dist/modules/scorecard/scorecard.js';
const card = await mountScorecard(el, { targets: ['/', '/pricing.html', { name: 'Card', html: '<div class="card">...</div>' }], checks: ['accessibility'], historyKey: 'my-scorecard' });
```

Renders every target at each theme and width in off-screen frames, runs the SDK quality checks (`js/quality.js`: accessibility, layout, spacing, touch targets, focus), scores each 0-100 (`js/scoring.js`) and ranks them worst first. Options: `signal` (an AbortSignal that destroys the card and stops a run in flight), `targets` (required: a same-origin URL, `{ name, url }`, `{ name, html }` rendered with the SDK stylesheets, `{ name, srcdoc }`, or `{ name, samples: [...] }` scored as one), `checks` (keep only findings whose check or category is listed, for example `['accessibility', 'touch-target']`), `themes` (default dark and light), `widths` (default 375 and 1024), `historyKey` (keeps runs in localStorage and shows the change since the last), `historyMax`, `autorun`, `theme`, `height`, `link` (a ranked name's href), and `sections`. Returns `{ run(), results(), report(), ready, destroy() }`; `runTargets`, `openFrame` and `rankedTable` are exported too. A page on another origin cannot be read and scores as one `unreadable` error. `sections` chooses the parts, default `['ranked']` (the scorecard as it always was): `ranked`, `performance` (scored performance, scale, look and accessibility with their metrics and stylesheets, from `data.scoring` and `data.files`), `size` (gzip size of built files against their budgets: `data.sizes`, `data.budgets`), `api` (the API surface against the previous release: `data.apiBaseline`, `data.api`), `sweep` (`data.sweep`), `security` (`data.security`, `fileLink(file, line)`) and `history`. `data` entries are a URL of the page's own origin (a relative URL is read against the page; another origin is refused) or the parsed object; a section without its data says so with an empty state. `targets` is only required by `ranked` and `performance`. The framework sections are drawn with `pk-card`, `pk-stat`, `pk-table`, `pk-tabs`, `pk-badge`, `pk-button` and `pk-empty-state`; their logic is `js/framework-checks.js`. The SDK's own Scorecard page is a thin host that mounts the module with every section and its own data. No element: a scorecard run is an action, not markup.

Pass `data: { quality: '/quality-report.json' }` (the file `node scripts/scorecard-sweep.mjs --write-report` writes, or the parsed object) and the ranked and performance sections open on that precomputed report with no frames rendered; the button then reads `Run live` and measures again in this browser. A missing or empty report leaves the run-first view.

### Theme editor

```js
import { mountThemeEditor } from './dist/modules/theme-editor/theme-editor.js';
const editor = await mountThemeEditor(el, { storageKey: 'my-theme', onchange: ({ css, overrides }) => save(css) });
editor.export();   // the override CSS block
```

Lists every token in the SDK token stylesheet with an input for each (a colour picker for colours, a number and a unit field, `pk-unit-input`, for lengths in px, rem, em or %, text for the rest), applies edits live, grades the text pairs for contrast (`js/colour.js`) and exports or imports the override block in the format the server-side `PkThemeOverrides` helper takes. Options: `target` (a `Document`, the default: one adopted stylesheet of override CSS; or an `Element`: the current theme's overrides as inline custom properties, so only that subtree changes), `theme`, `onchange({ css, overrides })`, `tokens` (URL of the token stylesheet; `dist/theme-editor/tokens.css` by default), `pairs` (`[foreground, background]` token names to audit; `AA_PAIRS` by default), `storageKey` (keeps the overrides in localStorage), `height`, `preview` (a Preview tab of sample controls; default on), `initial` (the theme to start from: override CSS, the JSON or an object; used when nothing was kept for the viewer) and `presets` (`[{ name, description?, theme }]` of your own, listed after the built-in ones). Returns `{ export(), overrides(), setTheme(name), reset(), undo(), redo(), share(), importShare(text), applyBrand(colour, { neutral, warn }), presets(), saved(), applyPreset(idOrSavedName), destroy() }`. The Presets tab applies a built-in preset (the default, a high-contrast theme at 7:1 or better, a compact and a roomy density; each replaces the current edits) or one of your saved themes; saved themes are named, can be applied, renamed and deleted, and live in localStorage under the `savedKey` option (`pk-theme-editor-saved`; `false` keeps none), best effort: a blocked storage is logged and they last until the page closes (`js/theme-presets-logic.js`). Undo and redo (buttons, Ctrl or Cmd+Z, Shift+Z or Y outside a text field) walk every change, typing in one field being one step, on the generic undo/redo stack `js/history.js` (below); the Changes tab lists each edit against the stylesheet value ("3 changes") with a reset for each edit and for each group of tokens (`js/theme-history-logic.js`, a thin consumer of it). The Export / import tab has the CSS block, a copy-paste snippet (save it as `theme.css` and load it after the SDK stylesheets), the JSON, and a shareable link: the edits go in the link fragment (`#pk-theme=z.<deflate, base64url>`, plain when the browser has no `CompressionStream`; at most 4096 characters) and are read back with the same rules as pasted JSON, so a link is text only and never markup; the option `readHash: true` applies the theme in the page's own fragment at mount as edits (`js/theme-share-logic.js`). The Contrast tab is a live audit: every pair in `pairs` in both themes under the current edits, as sample text with its ratio, failing pairs first, a summary and the count in the tab title, and a jump button for each side of a pair that opens the token in the Tokens tab in the right theme (`auditPairs`, `auditSummary`). The Palette tab generates a whole theme from one brand colour (optionally a neutral tint and a warn colour): accent, fill, hover, link and the text and surface ramps of both themes, with every pair in `AA_PAIRS` (the pairs the toolkit promises) at 4.5:1 or better, shown as swatches with their ratios; a brand colour that is too light or too dark to serve as text or as a fill is moved and the tab says how far. Apply writes the result as ordinary edits you can still change. The Custom SDK tab (option `sdk: false` leaves it out; `dist` is the folder URL of the shipped files, by default the release layout next to the module) exports a theme-only zip, a breakpoints-only `dist`, or both: see "Custom SDK export" under Responsive design and breakpoints. The pure logic is `js/theme-editor-logic.js` and `js/brand-palette-logic.js` (`generatePalette`, `applyPalette`, `paletteRows`). The SDK's Theme page is a thin host on it. No element: an editor with an export method is an app, not markup.

`js/brand-palette-logic.js` is a general-purpose utility, not theme-editor-private: it has no dependency on the editor or on DOM, and any app that lets a user pick a brand colour can call it directly to get an accessible palette. `generatePalette(brandHex, { neutral, warn, tokens })` writes Plainkit's own custom-property names (`DEFAULT_TOKENS`: `--color-accent`, `--btn-warn-bg`, ...) unless `tokens` names different ones (a partial override, e.g. `{ accent: '--brand-accent' }`, so only the keys you rename change); `applyPalette` and `paletteRows` already take a plain overrides/tokens dictionary and never assume Plainkit's names, so both work the same for a custom token set.

### Logs and logging settings

`mountLogs(el, { level, scopes, max, order, height })` is a live view of what the SDK and your code logged through `createLogger` (`js/log.js`): the ring buffer at mount, then every new entry, whatever the console level (an entry below it is marked "buffered only": kept here, sent to no output). Filter by minimum level, scope (a multi-select of the scopes seen) and text; a row opens its detail (objects as JSON, an Error with its stack); copy, export and import as JSON; pause; clear. Returns `{ pause(), resume(), isPaused(), clear(), entries(), select(id), filter({ level, scopes, text }), destroy() }`. `mountLogSettings(el, { onsave, onchange })` edits the configuration: the global level, a level per scope (the scopes seen so far, plus any you add by name), which outputs each level goes to (console, toast, alert and every output registered with `registerLogOutput`), Send a test (one entry per level under the scope `settings-test`, using the settings as edited, for that page), Save (`configureLogging(..., { persist: true })`) and Reset (`resetLogging()`). `?pk-log=` in the address and `<html data-pk-log>` still choose the level when a page loads. Returns `{ config(), refresh(), save(), reset(), test(), destroy() }`. Both are built only from SDK components; the pure logic is `js/log-view-logic.js` and `js/log-settings-logic.js`. The SDK's Settings page has a Logging section, and the dev tools have Logs and Logging tabs. Each is `dist/logs/logs.js` and `dist/log-settings/log-settings.js`.

### Performance, console and dev tools

`mountPerformance(el, { interval, history, autostart })` shows the Core Web Vitals, frame rate, long tasks, DOM size, heap and page weight from the browser's own APIs. `mountConsole(el, { capture, max, tab })` records `console.*`, errors, the `pk-*` events the elements fire, network requests, the `pk-*` elements on the page and the environment. `mountDevTools(container, { mode: 'dock' | 'inline', hotkey, tab, open, size, panels })` puts them, plus Logs, Logging, Quality, Inspector, Theme (the theme editor, live on the page) and Layout builder (a scratch instance of the layout builder) panels, in one tabbed surface: a bottom dock toggled with Ctrl+` or inline in a container. A panel of your own is `{ id, title, mount(element, context) }`. Each is `dist/<name>/<name>.js`.

The element inspector, `createElementInspector(container)` in `dist/js/element-inspector.js`, shows one element from its API data (`dist/elements/api.json`): tag, summary, live markup with a copy button, properties, slots, events, CSS parts and properties and methods; with nothing selected it shows an empty state. It is what the gallery's Details drawer uses. `inspector.show({ meta, element, extraSections })` draws an element (`element` is the live element; `inspector.refresh()` redraws after it changes; `show(null)` clears it). A host adds its own sections with `extraSections`, an array of `{ title, render(container, { meta, element }), open? }`: each becomes an accordion item after the built-in ones and `render` fills its container using SDK components only. It runs on `show()` and on every `refresh()`; if it throws, the error is logged (scope `element-inspector`), that section shows a note and the others still draw. This is how a host such as a layout builder or PlainKit.Blazor's `/_plainkit` page contributes its own sections (for example a Blazor parameter table); the SDK itself carries none.

### Layout builder

```js
import { mountLayoutBuilder } from './dist/modules/layout-builder/layout-builder.js';
const builder = await mountLayoutBuilder(el, { html: '<pk-card heading="Hi">Body</pk-card>', onchange: ({ model }) => draft(model), onsave: ({ model, html }) => save(model, html) });
builder.getModel(); builder.toHtml(); builder.destroy();
```

An editor for a page built from Plainkit elements: a palette generated from `dist/elements/api.json` (grouped like the gallery, with search, so a new element appears without a builder change), the page rendered live in an inert canvas, a structure tree (`pk-tree`), a properties form and the element inspector for the selected element, and the exported HTML. The page is a JSON document (`js/layout-model.js`, below) and the host owns persistence: the builder stores nothing. Options: `registry` (the element API: an array or a URL; default `dist/elements/api.json` beside the module), `model` (a document or its JSON text) or `html` (starting markup, sanitised), `onchange({ model, reason })`, `onsave({ model, html })` (adds a Save button), `exporters` (`{ name: (model, helpers) => text }`: extra export formats a host contributes, for example Razor from the Blazor side), `height`, `theme`. Returns `{ element, getModel(), setModel(model), setHtml(markup), toHtml(options), exportAs(name), select(id), selection(), insert(tag), undo(), redo(), on(event, fn), destroy() }`. Refused input (an unknown tag, a script, a bad prop value, an invalid drop) is logged through the SDK logger (scope `layout-builder`) and reported, never applied.

Keyboard, with the canvas or the tree focused: arrows select, Alt+arrows move the selection (Up and Down reorder, Left moves it out of its parent, Right into the element before it), Delete removes, Ctrl+D duplicates, Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes; the toolbar and the palette do the same with buttons (touch targets are 44px on a phone, where the panes become tabs). Pointer drag and drop (canvas reorder, and a palette-to-canvas drop) has its primitive now, `pk-sortable` (Layout group): the builder itself does not wire it up yet, and the responsive preview needs an iframe; both are next (`modules/layout-builder/DESIGN.md`, which also answers the design questions). The SDK's Layout builder page is a thin host on the module. No element: an editor is an app, not markup.

### Layout builder: the document model

`dist/js/layout-model.js` is the model a layout builder edits (the editor above edits it; the design is in `modules/layout-builder/DESIGN.md`). A page is a JSON tree `{ version, seq, nodes }`; a node is `{ id, tag, props, slots }` (props: attribute name to a string, or `true` for a boolean attribute; slots: slot name, `''` for the default, to children; a child is a node or a string of text). It is pure data and functions, with no DOM:

```js
import { createRegistry, emptyDoc, insertNode, setProp, toHtml, fromHtml, validateDoc, createHistory } from './dist/js/layout-model.js';
const registry = createRegistry(await (await fetch('dist/elements/api.json')).json());
let { doc, id } = insertNode(emptyDoc(), { node: { tag: 'pk-card', props: { heading: 'Hi' }, text: 'Body' } }, registry);
doc = setProp(doc, { id, name: 'tone', value: 'error' }, registry).doc;
toHtml(doc);                                   // '<pk-card heading="Hi" tone="error">Body</pk-card>'
const { doc: loaded, problems } = fromHtml(html, { registry });   // sanitised: what was refused is listed in problems
```

`validateDoc(doc, registry)` returns problems (`{ code, severity, message, id, path }`): the checks the skills use for markup (real element, prop, slot and enum value, numbers, JSON, no `style`) plus structure, text form and limits (depth 32, 5000 nodes). `fromHtml` and `fromJson` never return a document with errors; scripts, styles, iframes, forms, handlers, `javascript:` and `data:` URLs and unknown tags are refused. `toHtml(doc, { ids, compact })` and `fromHtml(text, { registry, ids })` round-trip (`data-lb-id` carries ids when asked); `toJson` and `fromJson` round-trip exactly. The operations (`insertNode`, `moveNode`, `removeNode`, `duplicateNode`, `wrapNode`, `setProp`, `setText`, `setSlot`) return a new document and throw `ModelError` (with `code` and `problems`) when the edit is not valid; `createHistory(doc)` is the undo and redo stack.

### Undo/redo: a generic history stack

`js/history.js` is a coalesced, capped undo/redo stack for any opaque value, no DOM or timers of its own:

```js
import { createHistory, record, undo, redo, canUndo, canRedo } from './dist/js/history.js';
let h = createHistory(value);
h = record(h, next, { key: 'title', at: Date.now() });   // consecutive edits sharing one key inside COALESCE_MS are one step
h = undo(h); h = redo(h); h.present;                        // the value now
canUndo(h); canRedo(h);
```

`createHistory(present)` starts a history at that value. `record(h, next, { key, at })` pushes `next` as a new step, unless it equals the current present (no-op) or shares `key` with the previous step and arrives within `COALESCE_MS` (800ms) of it, in which case it replaces the top of the stack instead of adding to it - so many keystrokes in one field are one undo step. `undo`/`redo` walk the stack (a no-op at either end returns the same history, so callers can toggle a button's `disabled` on `canUndo`/`canRedo`); recording after an undo drops the redo branch. The stack is capped at `MAX_STEPS` (100) steps of past. It never mutates a value it is given. The theme editor's Changes tab (`js/theme-history-logic.js`) is a thin consumer: it adds only the token-specific parts (`diffOverrides`, `tokenGroup`, `withoutGroup`) on top of this stack.
