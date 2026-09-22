# Plainkit

A dependency-free UI toolkit: plain HTML, CSS custom properties and small ES modules. No framework, no build step to use it,
no runtime requests to anything but its own files. Everything in this folder works when the folder is copied anywhere.

## Use it

Copy `dist/` (or the whole folder) to any static host and link one stylesheet and, if you want behaviour, one module:

```html
<link rel="stylesheet" href="plainkit/dist/plainkit.min.css">
<script type="module">
  import { initPlainkit } from './plainkit/dist/js/plainkit.js';
  initPlainkit();
</script>
```

Themes are token sets: set `data-theme="dark"` or `"light"` (and optionally `data-density="compact"`) on any element. Each element is one module in
`dist/elements/<name>.js`, loaded on demand; `dist/manifest.json` lists every file of the runtime with an SRI hash. The dev tools (below) are a separate unit, `dist/modules/`, with its own manifest and zip: the runtime never fetches one.

## Serve and explore

Needs only Node, no install. From the repository root: `node core/tools/serve.mjs`, or on Windows `core\tools\start.cmd` (opens the browser). It serves on port 5310.

```
node tools/serve.mjs 5310          # any static server works; this one has no dependencies
node tools/serve.mjs 5310 --csp    # script-src 'self' (no inline scripts)
```

Open `/` for the site: gallery (every element, layout, template and pattern), theme editor, scorecard, files, guides (Spacing is a gallery foundation, `#/foundations/spacing`). The pages use only
relative paths, so the folder can be served under any prefix (`/sdk/<version>/`).

## Layout

| Path | What |
|---|---|
| `tokens/` | `tokens.css`: every colour, size, space and shadow, per theme; `breakpoints.json`: the named breakpoints (`phone` 640, `tablet` 1024, `wide` 1280) |
| `base/` | The page layer for the light DOM: `base.css` (element baselines, spacing rhythm), `spacing.css`, `typography.css`, `table-content.css`, `utilities.css` and `a11y.css` (focus and phone rules; loads last) |
| `js/` | Shared modules: `element.js` (the base class), `loader.js` (on-demand loading), `plainkit.js` (entry), `theme.js`, `colour.js`, `quality.js`, `scoring.js`, `audit.js`, `code-explorer/` |
| `elements/<name>/` | The custom elements: `<name>.html` (template), `.css`, `.js` (behaviour, optional), `.meta.json` (the API); `.element.js` is generated. `registry.js` maps tag to module |
| `layouts/<id>/` | Page anatomies (list, record, setup, tool, wizard): `<id>.html` + `<id>.meta.json` listing the elements used |
| `samples/templates/<id>/`, `samples/patterns/<id>/` | Full-page templates and composed patterns, each in its own folder with `.html`, `.meta.json` (and `.js`: a template's page script, a pattern's optional `mount(root)` script) |
| `site/` | The site: `shell.js`, `site.css` and the pages `gallery/`, `theme/`, `scorecard/`, `files/`, `guides/` (its `content/*.md` are the guides; `spacing/` only redirects to the gallery) |
| `STANDARDS.md` | The rules: naming, tokens, modules, the dist pattern, CSP, and keeping SDK and Blazor in step |
| `HANDOFF.md` | State of the tool-module work: what is built, what is left, the gotchas |
| `modules/<tool>/` | The tool modules (`mountCodeExplorer`, ...): source of `dist/modules/<tool>/` (their own unit, see "Tool modules"); the site pages are thin hosts on them |
| `tools/` | `build.mjs`, `breakpoints.mjs` (named breakpoints resolved at build), `breakpoint-report.mjs` (what changes at each), `serve.mjs` (generates the output itself when it is missing), `snapshot.mjs`, `security.mjs`, `api-surface.mjs`, `markdown.mjs` and `guides.mjs` (the Guides' Markdown converter and loader) |
| `tests/` | Cross-cutting tests (`node --test tests`); `tests/browser/` is the in-browser element suite (open it in a tab, attested by `report.json`) |
| `dist/` | Generated output (not in git; `node scripts/bootstrap.mjs` from the repository root writes it); never edit |

`plainkit.css`, `elements/*/*.element.js`, `site/gallery/gallery.data.js`, `site/guides/guides.data.js`, `site/files/snapshot.json`, `site/scorecard/api.current.json`, `js/version.js` and `dist/` are generated from the element, layout and sample folders by `node tools/build.mjs`, and none of them is in git. On a fresh clone (and after switching branches or editing sources) run `node scripts/bootstrap.mjs` from the repository root: it runs the build, then the Blazor wrapper generator, the skills generator and the package copy (about 4 seconds). `node tools/serve.mjs` runs it by itself when the files are missing. The pinned release is the GitHub release `dist` zip, or NuGet; there is no CDN link by git tag, because a tag does not carry `dist`.

## Responsive design and breakpoints

The SDK is desktop-first and responds at three named widths, one source, `tokens/breakpoints.json`: `phone` 640, `tablet` 1024, `wide` 1280 (a rule applies at that width and below). CSS custom properties cannot be used inside `@media`, so the names are resolved when the SDK is built.

- **Element CSS** (`elements/<name>/<name>.css`) writes the name: `@media (--phone)` is `(max-width: 640px)`, `@media (--above-phone)` is `(min-width: 641px)`, and a name combines like any feature (`(--phone) and (orientation: portrait)`, `(pointer: coarse), (--phone)`, `(--above-phone) and (--tablet)` for a band). `tools/breakpoints.mjs` replaces them in the generated module; an unknown name fails the build.
- **CSS the site loads unbuilt** (`tokens/`, `base/`, `site/`, `modules/`, `samples/`) cannot use names, so it writes the literal width, and `tests/breakpoints.test.mjs` fails when that width is not a named one (or one above it).
- **Scripts** never repeat a width: `js/breakpoints.js` (`mediaBelow('phone')`, `mediaAbove`, `breakpoint(name)`) reads `--pk-bp-phone`, `--pk-bp-tablet` and `--pk-bp-wide`, which `plainkit.css` defines on `:root`; without them it uses the default and logs one debug line.
- **The analysis:** `node core/tools/breakpoint-report.mjs` (or `--json`) lists, per breakpoint, the elements, selectors and properties that change there; the build writes it to `dist/breakpoints.report.json`.
- **Different widths** need a rebuild (edit `breakpoints.json`, run `node scripts/bootstrap.mjs`); a prebuilt `dist` has the default set, and the theme editor's **Custom SDK** tab rewrites the widths in it without a checkout (below).
- **Custom SDK export** (the theme editor's Custom SDK tab, `modules/theme-editor/sdk-tab.js`): theme and breakpoints are independent choices. *Theme only* is a small zip (`plainkit-theme.css` to load after `plainkit.css`, `plainkit.custom.json`, `README.md`) and fetches nothing. *Breakpoints* (whole pixels, 320 to 2560, ascending, 64 apart, with a live table of the elements and properties that change at each, from `dist/breakpoints.report.json`) and *both* fetch the shipped `dist` from the same origin, check every file against `dist/manifest.json`, rewrite the widths in `@media` conditions (`plainkit.css`, `plainkit.min.css`, `elements/*.js`, the tools' CSS and the `--pk-bp-*` block), bake the theme into the two page sheets, recompute `manifest.json` (size and SHA-384 SRI per file) and write a store-only zip (`dist/`, `plainkit.custom.json`, `README.md`). With the shipped widths and no theme the result is the shipped `dist` byte for byte. The logic is dependency-free and shared with the build: `js/custom-sdk-logic.js` (the resolver, validation, rewrite, manifest text, README, settings), `js/custom-sdk.js` (fetch and export) and `js/zip-store.js` (the zip writer); `tests/custom-sdk-logic.test.mjs` covers them. The guide "Responsive design and breakpoints" is the user-facing version.

## Add a guide

The Guides page (`site/guides/`) shows the Markdown files in `site/guides/content/`. A guide is `<id>.md` (lowercase letters, digits and dashes: the file name is its address, `#/<id>`) that starts with front matter and then uses `##` and below (the page shows the title as its one `h1`):

```markdown
---
title: Getting started with the SDK
order: 1
summary: One sentence for the list and the top of the page.
---

## Install
```

It reads headings, paragraphs, lists, fenced code (the language becomes the label of a `pk-code-block`), tables, images (files next to the guides), links, `code`, bold and italic, and a quote is a `pk-alert` (`> [!warning] Text` picks the kind). Raw HTML is shown as text, never passed through. Link to another guide with `[text](other-guide.md#heading-id)`; the build checks that the guide and the heading exist and fails, naming the file, on any problem. `node scripts/bootstrap.mjs` converts the guides into `site/guides/guides.data.js` (generated, not in git), each guide carrying a `words` field too: its title, summary and body text reduced to a small search index (`site/guides/guides-search.js`) that the page's search box matches typed words against, title and body both. `scripts/tests/guides.test.mjs` checks the code in every guide against the SDK and Blazor API, so a sample must use real `pk-*` tags, props, `Pk*` components and exports.

## Add a sample

Make a folder `samples/patterns/<id>/` (or `samples/templates/<id>/`, `layouts/<id>/`) with `<id>.html` and `<id>.meta.json` (`id`, `title`, `summary`, `used`, `order`, plus `built` and `mobile` for patterns and layouts). `used` must list the elements the markup uses (the `pk-` tags, without the prefix); `node --test tests/samples.test.mjs` prints the exact list when it is wrong. Then run `node tools/build.mjs`.

## Using the SDK without Blazor

Plain HTML, no build step:

```html
<link rel="stylesheet" href="dist/plainkit.css">
<script type="module">
  import { initPlainkit } from './dist/plainkit.js';
  initPlainkit();
</script>
<pk-card heading="Shipping"><pk-button slot="actions" variant="primary">Edit</pk-button>Body</pk-card>
```

The loader imports only the elements the page uses. Props are attributes or properties, events are `addEventListener`, forms and `data-theme` work natively. Editor support (`custom-elements.json`, VS Code data, web-types, TypeScript typings) is generated into `dist/`. To write your own element, extend `PkElement` from `js/element.js` and call `define()`; see `STANDARDS.md` and an element folder such as `elements/badge/`. The planned reactive layers (templates with expressions, `defineElement`, app islands, single-file components) are described there and are not built yet.

## Embed the gallery in your own page

`dist/gallery/` is the SDK gallery, self-contained. Show all of it, or only what you want, with one element (it loads on demand, in a frame):

```html
<pk-gallery kind="elements" group="Form controls" theme="light" width="phone"></pk-gallery>
<pk-gallery control="button,input"></pk-gallery>
<pk-gallery chrome="full" height="560"></pk-gallery>
```

Attributes: `kind` (foundations, elements, layouts, templates; `controls` is the old name of elements), `group`, `control` (an element tag or name, or a comma list), `theme` (dark, light), `width` (desktop, phone),
`filter` (search text), `chrome` (`none` is the default: content only, sized to fit; `full` keeps the nav, toolbar and the Details inspector (an element page's API and live markup)), `height` (pixels) and `src`
(the address of `gallery/embed.html` when it is not next to `elements/`; a relative address resolves against `document.baseURI`, so it works on a routed page) and `sections` (below). The SDK's own gallery page uses the same module (`mountGallery` in `site/gallery/gallery.js`).
A narrowed mount (`kind`, `group`, `control`) shows only that part everywhere: its overview cards, the nav and the Elements list; `filter` narrows the same lists by title. The option rules are in `js/gallery-options.js`.

**Patterns run in the gallery.** A pattern that ships a script (`samples/patterns/<id>/<id>.js`: `export default function mount(root)` returning `{ destroy() }`) runs it wherever the gallery shows the pattern: on the full-page preview (`site/gallery/preview.js`) and in the inline views (a mount without chrome, where each pattern is drawn in a desktop and a phone sample frame). An inline frame carries the script name in `data-pattern`; `frame-boot.js` loads it inside the frame and mounts it on the frame's own markup (`site/gallery/pattern-mount.js`), when the frame is drawn, and the frame is drawn only when its slot scrolls into view, so a view that is off screen or collapsed runs nothing. The script ends (its one AbortController aborts) when the view is drawn again, on `pagehide` and when the gallery removes the frame; a theme, text size or width change does not redraw the frame, so a toast or an unsaved bar keeps its state. A script that fails to load or throws is logged through the SDK logger (scope `gallery-pattern`) and the sample stays static. The shell layout stays a schematic.

**Host sections in the Details drawer.** With `chrome` full, a host can add sections to the inspector for the open element, even though the gallery runs in its own frame: pass plain data, never code.
`sections` is a list of `{ tag?, title, open?, lines?, columns?, rows?, code? }`, all text: `tag` limits it to one element (`pk-button`; none shows it for every element), `lines` are short paragraphs, `columns` and `rows` a table, `code` one block of monospaced text with a copy button.
Give it to `mountGallery(container, { sections })` or `setGallerySections(list)` in the same document, or to the element as JSON text, `<pk-gallery chrome="full" sections='[{"tag":"pk-button","title":"Notes","lines":["Used on the order page."]}]'>`, which is sent to the frame by message.
The contract has no callbacks: the frame posts `{ type: 'pk-gallery-ready' }` to its parent once mounted, and the host answers with `{ type: 'pk-gallery-sections', sections }` (the whole list, again whenever it changes; an empty list clears). The frame believes only its embedding window.
Everything is set as text (never parsed as markup, so nothing can inject HTML or script), drawn with SDK components (`pk-accordion-item`, `pk-table`, `pk-code-block`) and cut to limits (200 sections, 80 characters of title, 400 per cell or line, 60 rows of 6 cells, 4000 characters of code; `LIMITS` in `js/gallery-sections.js`).
The section is static per element: it cannot follow the live markup (use `createElementInspector` with `extraSections` in your own document for that), and the SDK keeps no copy of what the host sends. PlainKit.Blazor uses it for the Blazor section (`PkGallerySection.ForBlazor()`).

## Tool modules: code explorer, scorecard, theme editor, performance, console, logs, log settings, dev tools

Each tool ships as a JavaScript module in `dist/modules/<tool>/` with one function, `mountX(container, options)`, that you call from your own page. The document needs no setup beyond the module: it adds `dist/plainkit.css` if it is not already loaded (it styles the whole page, like any SDK page).

### The two units: runtime and modules

The build makes two units, each with its own manifest (sizes and SRI hashes) and its own release zip:

| Unit | Folder | Manifest | Release asset | Holds |
| --- | --- | --- | --- | --- |
| Runtime SDK | `dist/` (without `modules/`) | `dist/manifest.json` | `plainkit-dist-<version>.zip` | `plainkit.css`, `plainkit.min.css`, `plainkit.js`, `js/`, `elements/`, `icons.svg`, the gallery, the editor-support files, `skills/` |
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

Renders every target at each theme and width in off-screen frames, runs the SDK quality checks (`js/quality.js`: accessibility, layout, spacing, touch targets, focus), scores each 0-100 (`js/scoring.js`) and ranks them worst first. Options: `targets` (required: a same-origin URL, `{ name, url }`, `{ name, html }` rendered with the SDK stylesheets, `{ name, srcdoc }`, or `{ name, samples: [...] }` scored as one), `checks` (keep only findings whose check or category is listed, for example `['accessibility', 'touch-target']`), `themes` (default dark and light), `widths` (default 375 and 1024), `historyKey` (keeps runs in localStorage and shows the change since the last), `historyMax`, `autorun`, `theme`, `height`, `link` (a ranked name's href), and `sections`. Returns `{ run(), results(), report(), ready, destroy() }`; `runTargets`, `openFrame` and `rankedTable` are exported too. A page on another origin cannot be read and scores as one `unreadable` error. `sections` chooses the parts, default `['ranked']` (the scorecard as it always was): `ranked`, `performance` (scored performance, scale, look and accessibility with their metrics and stylesheets, from `data.scoring` and `data.files`), `size` (gzip size of built files against their budgets: `data.sizes`, `data.budgets`), `api` (the API surface against the previous release: `data.apiBaseline`, `data.api`), `sweep` (`data.sweep`), `security` (`data.security`, `fileLink(file, line)`) and `history`. `data` entries are a URL of the page's own origin (a relative URL is read against the page; another origin is refused) or the parsed object; a section without its data says so with an empty state. `targets` is only required by `ranked` and `performance`. The framework sections are drawn with `pk-card`, `pk-stat`, `pk-table`, `pk-tabs`, `pk-badge`, `pk-button` and `pk-empty-state`; their logic is `js/framework-checks.js`. The SDK's own Scorecard page is a thin host that mounts the module with every section and its own data. No element: a scorecard run is an action, not markup.

### Theme editor

```js
import { mountThemeEditor } from './dist/modules/theme-editor/theme-editor.js';
const editor = await mountThemeEditor(el, { storageKey: 'my-theme', onchange: ({ css, overrides }) => save(css) });
editor.export();   // the override CSS block
```

Lists every token in the SDK token stylesheet with an input for each (a colour picker for colours, a number and a unit field, `pk-unit-input`, for lengths in px, rem, em or %, text for the rest), applies edits live, grades the text pairs for contrast (`js/colour.js`) and exports or imports the override block in the format the server-side `PkThemeOverrides` helper takes. Options: `target` (a `Document`, the default: one adopted stylesheet of override CSS; or an `Element`: the current theme's overrides as inline custom properties, so only that subtree changes), `theme`, `onchange({ css, overrides })`, `tokens` (URL of the token stylesheet; `dist/theme-editor/tokens.css` by default), `pairs` (`[foreground, background]` token names to audit; `AA_PAIRS` by default), `storageKey` (keeps the overrides in localStorage), `height`, `preview` (a Preview tab of sample controls; default on), `initial` (the theme to start from: override CSS, the JSON or an object; used when nothing was kept for the viewer) and `presets` (`[{ name, description?, theme }]` of your own, listed after the built-in ones). Returns `{ export(), overrides(), setTheme(name), reset(), undo(), redo(), share(), importShare(text), applyBrand(colour, { neutral, warn }), presets(), saved(), applyPreset(idOrSavedName), destroy() }`. The Presets tab applies a built-in preset (the default, a high-contrast theme at 7:1 or better, a compact and a roomy density; each replaces the current edits) or one of your saved themes; saved themes are named, can be applied, renamed and deleted, and live in localStorage under the `savedKey` option (`pk-theme-editor-saved`; `false` keeps none), best effort: a blocked storage is logged and they last until the page closes (`js/theme-presets-logic.js`). Undo and redo (buttons, Ctrl or Cmd+Z, Shift+Z or Y outside a text field) walk every change, typing in one field being one step; the Changes tab lists each edit against the stylesheet value ("3 changes") with a reset for each edit and for each group of tokens (`js/theme-history-logic.js`). The Export / import tab has the CSS block, a copy-paste snippet (save it as `theme.css` and load it after the SDK stylesheets), the JSON, and a shareable link: the edits go in the link fragment (`#pk-theme=z.<deflate, base64url>`, plain when the browser has no `CompressionStream`; at most 4096 characters) and are read back with the same rules as pasted JSON, so a link is text only and never markup; the option `readHash: true` applies the theme in the page's own fragment at mount as edits (`js/theme-share-logic.js`). The Contrast tab is a live audit: every pair in `pairs` in both themes under the current edits, as sample text with its ratio, failing pairs first, a summary and the count in the tab title, and a jump button for each side of a pair that opens the token in the Tokens tab in the right theme (`auditPairs`, `auditSummary`). The Palette tab generates a whole theme from one brand colour (optionally a neutral tint and a warn colour): accent, fill, hover, link and the text and surface ramps of both themes, with every pair in `AA_PAIRS` (the pairs the toolkit promises) at 4.5:1 or better, shown as swatches with their ratios; a brand colour that is too light or too dark to serve as text or as a fill is moved and the tab says how far. Apply writes the result as ordinary edits you can still change. The Custom SDK tab (option `sdk: false` leaves it out; `dist` is the folder URL of the shipped files, by default the release layout next to the module) exports a theme-only zip, a breakpoints-only `dist`, or both: see "Custom SDK export" under Responsive design and breakpoints. The pure logic is `js/theme-editor-logic.js` and `js/brand-palette-logic.js` (`generatePalette`, `applyPalette`, `paletteRows`). The SDK's Theme page is a thin host on it. No element: an editor with an export method is an app, not markup.

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

## Build and test

```
node ../scripts/bootstrap.mjs  # from core/: generate everything (not in git): plainkit.css, gallery data, the Files snapshot, dist/, the Blazor wrappers, the skills
node tools/build.mjs        # only the toolkit part of it (deterministic)
node --test .               # unit, budget, security and API-surface tests (they need the bootstrap first and say so)
node tools/security.mjs     # scan for eval, inline handlers, secrets, unlisted innerHTML, ...
node site/scorecard/static-audit.mjs
```

### The in-browser element suite and its attestation

`tests/browser/` runs every element in a real browser (about 130 cases, about 170 seconds). The node suite cannot, so the last run is attested: `tests/browser/report.json` holds its results and a SHA-256 of every source it covered, and `tests/elements-attest.test.mjs` fails when an element source or a browser case changed after that run, or when the run had failures. Re-run it after any change to an element source, `js/element*.js`, `js/loader.js` or a browser case.

One command does the whole procedure (from the repository root; Node only, no browser package; it needs an installed Chrome, Chromium or Edge, found by `PK_CHROME` or the usual install paths):

```
node scripts/attest-browser.mjs
```

It starts `node core/tools/serve.mjs 5341 --write-reports`, opens `http://localhost:5341/tests/browser/` in a headless browser, waits for the page to post its report (about 170 s; it gives up after 420 s), prints the passed and failed counts from `report.json`, re-runs `node --test core/tests/elements-attest.test.mjs`, then stops the server and the browser and deletes the temporary profile. The exit code is 0 when every case passed and the attestation test passes, 1 for a failed case, 2 when the run could not finish. `--port`, `--timeout`, `--width`, `--height` and `--no-attest` are the options; `PK_CHROME_FLAGS` adds browser flags.

By hand, the same thing:

1. `node core/tools/serve.mjs 5341 --write-reports` (`--write-reports` lets the page post its report to the server, which writes `report.json`).
2. Open `http://localhost:5341/tests/browser/` in Chrome at desktop size. Headless: `chrome --headless=new --disable-gpu --no-first-run --user-data-dir=<a temporary folder> --window-size=1280,900 http://localhost:5341/tests/browser/`.
3. Wait about 170 s for "report saved" (a visible tab shows it; a headless run has no window, so read the file).
4. Read `tests/browser/report.json` (`passed` and `failed`), then `node --test core/tests/elements-attest.test.mjs`.
5. Stop the server and the browser and delete the temporary profile (on Windows a browser child can keep the folder locked for a moment; `scripts/attest-browser.mjs` ends the whole process tree and retries).

**Viewport.** Run it at desktop size, 1280x900 or larger. A small window (about 486x425) made the suite flaky, because several cases assert layout, so the script refuses a window smaller than 1024x700. A visible tab must stay in front: a background tab throttles timers.

**In CI.** The suite is not a required check: it takes minutes and reads layout, so a slow or differently configured runner would make a required check flaky, and the attestation already guards the sources cheaply. The runners have a Chrome preinstalled, and the script needs no npm dependency, so `.github/workflows/ci.yml` has a `browser` job that runs it on demand (Actions, Run workflow) and uploads `report.json`; it is not part of push or pull request runs. It has not been proven on a runner yet: promote it to a required check only after a few clean runs there.

### The scorecard analysis in one command

`node scripts/scorecard-sweep.mjs` runs the whole analysis headless (Node 22 or newer, no browser package; an installed Chrome, Chromium or Edge, found like `scripts/attest-browser.mjs` does, and `PK_CHROME` overrides). It starts the SDK server, drives the site over the DevTools protocol, then stops the server and browser and deletes the temporary profile. Three stages, all by default (`--only sweep,quality,pages`):

- **sweep**: every gallery view, template and element example at 320, 375, 640, 1024, 1280 and 1920 px in both themes (`site/scorecard/sweep.js`): overflow, phone controls under 44 px, nested scrollers, text under the size tiers, level-1 headings. Each item is loaded once, then resized and re-themed (`--fresh-frames` loads a frame per cell, the slow cross-check), and several browser tabs share the items (`--tabs`, default 4; `--frames`, default 3 per tab). A frame is measured when its toolkit elements are defined, its styles are applied and its layout has stopped changing (no fixed sleeps). `--kinds views,templates,samples`, `--filter <name fragments>`, `--widths` and `--themes` narrow a run to what a change touches; a full run takes minutes, not the 37 of the first version.
- **quality**: the scorecard run itself (the host page's own options): every element example through the SDK quality checks (`js/quality.js`) at each scoring width and theme, plus the measured performance and scale metrics and the scores. About 2 to 4 minutes (`--concurrency 2` renders fewer frames at once on a slow machine).
- **pages**: every gallery route in a real tab at 375 and 1280 px: the quality checks on the live page, first and largest paint, layout shift and long tasks (the performance monitor's measures against the limits in `js/perf-logic.js`), layout and style-recalculation counts, and what the dev console shows (console errors, uncaught exceptions, failed requests).

It writes `sweep.json`, `quality.json`, `pages.json` and `summary.md` (worst first) to `scratch/scorecard/` (git ignores it) and prints the summary. The exit code is 0 when nothing failed, 1 when the analysis found failures and 2 when the run could not finish. `site/scorecard/sweep-report.json` is not tracked (the repository ignores it; a report kept in the repository is stale after the next gallery edit). `--write-report` (a full sweep only) writes a small summary there: cells per metric and the worst item/metric groups, which the Scorecard page shows; the full failing cells stay in `scratch/scorecard/sweep.json`.

**What the sweep can and cannot see.** It measures each document's whole render tree: overflow of the page, controls and text in the page's own markup, in slotted content, and inside every OPEN shadow root, plus nested scrollers (light DOM only) and the level-1 heading count (shadow trees too). So what an element draws inside itself (a `pk-button`'s inner button, a field's help text) is checked for text size and touch targets exactly like a light-DOM control, not judged only through its host box. A *defined* toolkit element with no open shadow root (every `pk-*` element attaches one with `{ mode: 'open' }`, so this is not a normal path) is skipped and logged once per tag rather than crashing. The SDK quality checks (`js/quality.js`, the `quality` stage) also read accessible names from shadow text, and the `pages` stage runs them on the live page. Nested iframes (the gallery's sample previews) are measured by their own `sample` items, not from inside the gallery views.

## Add an element

1. Create `elements/<name>/` (the tag is `pk-<name>`).
2. Write `<name>.html` (the template), `<name>.css` (tokens only), `<name>.js` only if it needs behaviour, `<name>.meta.json` (the API, with examples), and `<name>.test.mjs` for logic.
3. Run `node scripts/bootstrap.mjs` (from the repository root), then `node --test .`; run the browser suite (`tests/browser/`) and refresh the attestation.

Rules the tests enforce: no literal colours in element CSS (tokens live in `tokens/tokens.css`), no inline scripts or event handlers, every `innerHTML` use is allow-listed with its markup source, the public surface (classes, tokens,
JS exports in `site/scorecard/api.baseline.json`) only grows, and size budgets in `site/scorecard/scoring.data.js`.

## Versioning

Semantic versioning is intended: removing or renaming a class, token or JS export is a major change (the API baseline test fails until it
is edited on purpose). Releases are not automated yet; `dist/manifest.json` and `site/scorecard/api.baseline.json` are kept ready for it.

## Licence

MIT. See `LICENSE`.
