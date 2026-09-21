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
`dist/elements/<name>.js`, loaded on demand; `dist/manifest.json` lists every file with an SRI hash.

## Serve and explore

Needs only Node, no install. From the repository root: `node core/tools/serve.mjs`, or on Windows `core\tools\start.cmd` (opens the browser). It serves on port 5310.

```
node tools/serve.mjs 5310          # any static server works; this one has no dependencies
node tools/serve.mjs 5310 --csp    # script-src 'self' (no inline scripts)
```

Open `/` for the site: gallery (every element, layout, template and pattern), theme editor, scorecard, files, guides (Spacing is a gallery foundation, `#/foundations/spacing`). The pages use only
relative paths, so the folder can be served under any prefix (`/sdk/1.0.0/`).

## Layout

| Path | What |
|---|---|
| `tokens/` | `tokens.css`: every colour, size, space and shadow, per theme |
| `base/` | The page layer for the light DOM: `base.css` (element baselines, spacing rhythm), `spacing.css`, `typography.css`, `table-content.css`, `utilities.css` and `a11y.css` (focus and phone rules; loads last) |
| `js/` | Shared modules: `element.js` (the base class), `loader.js` (on-demand loading), `plainkit.js` (entry), `theme.js`, `colour.js`, `quality.js`, `scoring.js`, `audit.js`, `code-explorer/` |
| `elements/<name>/` | The custom elements: `<name>.html` (template), `.css`, `.js` (behaviour, optional), `.meta.json` (the API); `.element.js` is generated. `registry.js` maps tag to module |
| `layouts/<id>/` | Page anatomies (list, record, setup, tool, wizard): `<id>.html` + `<id>.meta.json` listing the elements used |
| `samples/templates/<id>/`, `samples/patterns/<id>/` | Full-page templates and composed patterns, each in its own folder with `.html`, `.meta.json` (and `.js` for a template) |
| `site/` | The site: `shell.js`, `site.css` and the pages `gallery/`, `theme/`, `scorecard/`, `files/`, `guides/` (`spacing/` only redirects to the gallery) |
| `STANDARDS.md` | The rules: naming, tokens, modules, the dist pattern, CSP, and keeping SDK and Blazor in step |
| `HANDOFF.md` | State of the tool-module work: what is built, what is left, the gotchas |
| `modules/<tool>/` | The tool modules (`mountCodeExplorer`, ...): source of `dist/<tool>/`; the site pages are thin hosts on them |
| `tools/` | `build.mjs`, `serve.mjs`, `snapshot.mjs`, `security.mjs`, `api-surface.mjs` |
| `tests/` | Cross-cutting tests (`node --test tests`); `tests/browser/` is the in-browser element suite (open it in a tab, attested by `report.json`) |
| `dist/` | Generated output; never edit |

`plainkit.css`, `site/gallery/gallery.data.js` and `dist/` are generated from the element, layout and sample folders by `node tools/build.mjs`.

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
(the address of `gallery/embed.html` when it is not next to `elements/`). The SDK's own gallery page uses the same module (`mountGallery` in `site/gallery/gallery.js`).
A narrowed mount (`kind`, `group`, `control`) shows only that part everywhere: its overview cards, the nav and the Elements list; `filter` narrows the same lists by title. The option rules are in `js/gallery-options.js`.

## Tool modules: code explorer, scorecard, theme editor, performance, console, logs, log settings, dev tools

Each tool ships as a JavaScript module in `dist/<tool>/` with one function, `mountX(container, options)`, that you call from your own page. The document needs no setup beyond the module: it adds `dist/plainkit.css` if it is not already loaded (it styles the whole page, like any SDK page).

### Code explorer

```js
import { mountCodeExplorer } from './dist/code-explorer/code-explorer.js';
const explorer = await mountCodeExplorer(document.getElementById('code'), { snapshot: 'code.json', file: 'src/app.js', line: 12, search: 'TODO', theme: 'light', height: '32rem' });
```

Options: `snapshot` (URL of a snapshot JSON, or the parsed object), `provider` (a ready provider instead), `file` and `line` (open that file, focus that row), `search` (run a query: text or /regex/), `theme`, `height` (any CSS length or `fill`). Returns `{ element, openFile(path, { line }), search(query), destroy() }`. Make a snapshot of your own folder with `node tools/snapshot.mjs <folder> <out.json>` (text files only, no `node_modules`, `.git`, `bin`, `obj` or `dist`); the format is described in `js/code-explorer/providers.js`. The SDK's own Files page is a host on this module. There is no `pk-*` element: the existing `<code-explorer>` element already is one.

### Scorecard

```js
import { mountScorecard } from './dist/scorecard/scorecard.js';
const card = await mountScorecard(el, { targets: ['/', '/pricing.html', { name: 'Card', html: '<div class="card">...</div>' }], checks: ['accessibility'], historyKey: 'my-scorecard' });
```

Renders every target at each theme and width in off-screen frames, runs the SDK quality checks (`js/quality.js`: accessibility, layout, spacing, touch targets, focus), scores each 0-100 (`js/scoring.js`) and ranks them worst first. Options: `targets` (required: a same-origin URL, `{ name, url }`, `{ name, html }` rendered with the SDK stylesheets, `{ name, srcdoc }`, or `{ name, samples: [...] }` scored as one), `checks` (keep only findings whose check or category is listed, for example `['accessibility', 'touch-target']`), `themes` (default dark and light), `widths` (default 375 and 1024), `historyKey` (keeps runs in localStorage and shows the change since the last), `historyMax`, `autorun`, `theme`, `height`, `link` (a ranked name's href), and `sections`. Returns `{ run(), results(), report(), ready, destroy() }`; `runTargets`, `openFrame` and `rankedTable` are exported too. A page on another origin cannot be read and scores as one `unreadable` error. `sections` chooses the parts, default `['ranked']` (the scorecard as it always was): `ranked`, `performance` (scored performance, scale, look and accessibility with their metrics and stylesheets, from `data.scoring` and `data.files`), `size` (gzip size of built files against their budgets: `data.sizes`, `data.budgets`), `api` (the API surface against the previous release: `data.apiBaseline`, `data.api`), `sweep` (`data.sweep`), `security` (`data.security`, `fileLink(file, line)`) and `history`. `data` entries are a URL of the page's own origin (a relative URL is read against the page; another origin is refused) or the parsed object; a section without its data says so with an empty state. `targets` is only required by `ranked` and `performance`. The framework sections are drawn with `pk-card`, `pk-stat`, `pk-table`, `pk-tabs`, `pk-badge`, `pk-button` and `pk-empty-state`; their logic is `js/framework-checks.js`. The SDK's own Scorecard page is a thin host that mounts the module with every section and its own data. No element: a scorecard run is an action, not markup.

### Theme editor

```js
import { mountThemeEditor } from './dist/theme-editor/theme-editor.js';
const editor = await mountThemeEditor(el, { storageKey: 'my-theme', onchange: ({ css, overrides }) => save(css) });
editor.export();   // the override CSS block
```

Lists every token in the SDK token stylesheet with an input for each, applies edits live, grades the text pairs for contrast (`js/colour.js`) and exports or imports the override block in the format the server-side `PkThemeOverrides` helper takes. Options: `target` (a `Document`, the default: one adopted stylesheet of override CSS; or an `Element`: the current theme's overrides as inline custom properties, so only that subtree changes), `theme`, `onchange({ css, overrides })`, `tokens` (URL of the token stylesheet; `dist/theme-editor/tokens.css` by default), `pairs` (`[foreground, background]` token names to grade; `DEFAULT_PAIRS` by default), `storageKey` (keeps the overrides in localStorage), `height`, `preview` (a Preview tab of sample controls; default on). Returns `{ export(), overrides(), setTheme(name), reset(), destroy() }`. The pure logic is `js/theme-editor-logic.js`. The SDK's Theme page is a thin host on it. No element: an editor with an export method is an app, not markup.

### Logs and logging settings

`mountLogs(el, { level, scopes, max, order, height })` is a live view of what the SDK and your code logged through `createLogger` (`js/log.js`): the ring buffer at mount, then every new entry, whatever the console level (an entry below it is marked "buffered only": kept here, sent to no output). Filter by minimum level, scope (a multi-select of the scopes seen) and text; a row opens its detail (objects as JSON, an Error with its stack); copy, export and import as JSON; pause; clear. Returns `{ pause(), resume(), isPaused(), clear(), entries(), select(id), filter({ level, scopes, text }), destroy() }`. `mountLogSettings(el, { onsave, onchange })` edits the configuration: the global level, a level per scope (the scopes seen so far, plus any you add by name), which outputs each level goes to (console, toast, alert and every output registered with `registerLogOutput`), Send a test (one entry per level under the scope `settings-test`, using the settings as edited, for that page), Save (`configureLogging(..., { persist: true })`) and Reset (`resetLogging()`). `?pk-log=` in the address and `<html data-pk-log>` still choose the level when a page loads. Returns `{ config(), refresh(), save(), reset(), test(), destroy() }`. Both are built only from SDK components; the pure logic is `js/log-view-logic.js` and `js/log-settings-logic.js`. The SDK's Settings page has a Logging section, and the dev tools have Logs and Logging tabs. Each is `dist/logs/logs.js` and `dist/log-settings/log-settings.js`.

### Performance, console and dev tools

`mountPerformance(el, { interval, history, autostart })` shows the Core Web Vitals, frame rate, long tasks, DOM size, heap and page weight from the browser's own APIs. `mountConsole(el, { capture, max, tab })` records `console.*`, errors, the `pk-*` events the elements fire, network requests, the `pk-*` elements on the page and the environment. `mountDevTools(container, { mode: 'dock' | 'inline', hotkey, tab, open, size, panels })` puts them, plus Logs, Logging, Quality, Inspector and Theme (the theme editor, live on the page) panels, in one tabbed surface: a bottom dock toggled with Ctrl+` or inline in a container. A panel of your own is `{ id, title, mount(element, context) }`. Each is `dist/<name>/<name>.js`.

The element inspector, `createElementInspector(container)` in `dist/js/element-inspector.js`, shows one element from its API data (`dist/elements/api.json`): tag, summary, live markup with a copy button, properties, slots, events, CSS parts and properties and methods; with nothing selected it shows an empty state. It is what the gallery's Details drawer uses. `inspector.show({ meta, element, extraSections })` draws an element (`element` is the live element; `inspector.refresh()` redraws after it changes; `show(null)` clears it). A host adds its own sections with `extraSections`, an array of `{ title, render(container, { meta, element }), open? }`: each becomes an accordion item after the built-in ones and `render` fills its container using SDK components only. It runs on `show()` and on every `refresh()`; if it throws, the error is logged (scope `element-inspector`), that section shows a note and the others still draw. This is how a host such as a layout builder or PlainKit.Blazor's `/_plainkit` page contributes its own sections (for example a Blazor parameter table); the SDK itself carries none.

## Build and test

```
node tools/build.mjs        # regenerate plainkit.css, gallery data, the Files snapshot (site/files/snapshot.json), dist/ (deterministic)
node --test .               # unit, budget, security and API-surface tests
node tools/security.mjs     # scan for eval, inline handlers, secrets, unlisted innerHTML, ...
node site/scorecard/static-audit.mjs
```

## Add an element

1. Create `elements/<name>/` (the tag is `pk-<name>`).
2. Write `<name>.html` (the template), `<name>.css` (tokens only), `<name>.js` only if it needs behaviour, `<name>.meta.json` (the API, with examples), and `<name>.test.mjs` for logic.
3. Run `node tools/build.mjs`, then `node --test .`; run the browser suite (`tests/browser/`) and refresh the attestation.

Rules the tests enforce: no literal colours in element CSS (tokens live in `tokens/tokens.css`), no inline scripts or event handlers, every `innerHTML` use is allow-listed with its markup source, the public surface (classes, tokens,
JS exports in `site/scorecard/api.baseline.json`) only grows, and size budgets in `site/scorecard/scoring.data.js`.

## Versioning

Semantic versioning is intended: removing or renaming a class, token or JS export is a major change (the API baseline test fails until it
is edited on purpose). Releases are not automated yet; `dist/manifest.json` and `site/scorecard/api.baseline.json` are kept ready for it.

## Licence

MIT. See `LICENSE`.
