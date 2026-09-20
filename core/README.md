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

Themes are token sets: set `data-theme="dark"` or `"light"` (and optionally `data-density="compact"`) on any element. Per-component files
are in `dist/components/<name>/`; `dist/manifest.json` lists every file with an SRI hash.

## Serve and explore

Needs only Node, no install. From the repository root: `node core/tools/serve.mjs`, or on Windows `core\tools\start.cmd` (opens the browser). It serves on port 5310.

```
node tools/serve.mjs 5310          # any static server works; this one has no dependencies
node tools/serve.mjs 5310 --csp    # script-src 'self' (no inline scripts)
```

Open `/` for the site: gallery (every control, state, layout, template), theme editor, scorecard, spacing, files, guides. The pages use only
relative paths, so the folder can be served under any prefix (`/sdk/1.0.0/`).

## Layout

| Path | What |
|---|---|
| `tokens/` | `tokens.css`: every colour, size, space and shadow, per theme |
| `base/` | `base.css` (element baselines, spacing rhythm) and `a11y.css` (focus and phone rules; loads last) |
| `components/<name>/` | One folder per component: `<name>.html` (canonical markup, one fragment per sample), `.css`, `.js` (if it has behaviour), `.meta.json`, `.test.mjs` |
| `components/order.json` | Cascade order for `plainkit.css` |
| `js/` | Shared modules: `element.js` (the base class), `loader.js` (on-demand loading), `plainkit.js` (entry), `theme.js`, `colour.js`, `quality.js`, `scoring.js`, `audit.js`, `code-explorer/` |
| `elements/<name>/` | The custom elements: `<name>.html` (template), `.css`, `.js` (behaviour, optional), `.meta.json` (the API); `.element.js` is generated. `registry.js` maps tag to module |
| `layouts/<id>/` | Page anatomies (list, record, setup, tool, wizard): `<id>.html` + `<id>.meta.json` listing the components used |
| `samples/templates/<id>/`, `samples/patterns/<id>/` | Full-page templates and composed patterns, each in its own folder with `.html`, `.meta.json` (and `.js` for a template) |
| `site/` | The site: `shell.js`, `site.css` and the pages `gallery/`, `theme/`, `scorecard/`, `spacing/`, `files/`, `guides/` |
| `HANDOFF.md` | State of the tool-module work (T-138): what is built, what is left, the gotchas |
| `modules/<tool>/` | The tool modules (`mountCodeExplorer`, ...): source of `dist/<tool>/`; the site pages are thin hosts on them |
| `tools/` | `build.mjs`, `serve.mjs`, `snapshot.mjs`, `security.mjs`, `api-surface.mjs` |
| `tests/` | Cross-cutting tests (`node --test tests`); `tests/browser/` is the in-browser element suite (open it in a tab, attested by `report.json`) |
| `dist/` | Generated output; never edit |

`plainkit.css`, `site/gallery/gallery.data.js` and `dist/` are generated from the component, layout and sample folders by `node tools/build.mjs`.

## Add a sample

Make a folder `samples/patterns/<id>/` (or `samples/templates/<id>/`, `layouts/<id>/`) with `<id>.html` and `<id>.meta.json` (`id`, `title`, `summary`, `used`, `order`, plus `built` and `mobile` for patterns and layouts). `used` must list the component folders the markup uses; `node --test tests/samples.test.mjs` prints the exact list when it is wrong. Then run `node tools/build.mjs`.

## Using the SDK without Blazor

Plain HTML, no build step:

```html
<link rel="stylesheet" href="dist/plainkit.css">
<script type="module" src="dist/plainkit.js"></script>
<pk-card heading="Shipping"><pk-button slot="actions" variant="primary">Edit</pk-button>Body</pk-card>
```

The loader imports only the elements the page uses. Props are attributes or properties, events are `addEventListener`, forms and `data-theme` work natively. Editor support (`custom-elements.json`, VS Code data, web-types, TypeScript typings) is generated into `dist/`. To write your own element, extend `PkElement` from `js/element.js` and call `define()`; see `Standards/Plainkit.md` (Runtime). The planned reactive layers (templates with expressions, `defineElement`, app islands, single-file components) are described there and are not built yet.

## Embed the gallery in your own page

`dist/gallery/` is the SDK gallery, self-contained. Show all of it, or only what you want, with one element (it loads on demand, in a frame):

```html
<pk-gallery kind="controls" group="Forms & inputs" theme="light" width="phone"></pk-gallery>
<pk-gallery control="button,input"></pk-gallery>
<pk-gallery chrome="full" height="560"></pk-gallery>
```

Attributes: `kind` (foundations, controls, elements, layouts, templates), `group`, `control` (an id or a comma list), `theme` (dark, light), `width` (desktop, phone),
`filter` (search text), `chrome` (`none` is the default: content only, sized to fit; `full` keeps the nav, toolbar and inspector), `height` (pixels) and `src`
(the address of `gallery/embed.html` when it is not next to `elements/`). The SDK's own gallery page uses the same module (`mountGallery` in `site/gallery/gallery.js`).
See `Standards/Plainkit.md`, "Embedding the gallery".

## Tool modules: code explorer, scorecard, theme editor

Each tool ships as a JavaScript module in `dist/<tool>/` with one function, `mountX(container, options)`, that you call from your own page. The document needs no setup beyond the module: it adds `dist/plainkit.css` and `dist/plainkit-compat.css` if they are not already loaded (they style the whole page, like any SDK page).

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

Renders every target at each theme and width in off-screen frames, runs the SDK quality checks (`js/quality.js`: accessibility, layout, spacing, touch targets, focus), scores each 0-100 (`js/scoring.js`) and ranks them worst first. Options: `targets` (required: a same-origin URL, `{ name, url }`, `{ name, html }` rendered with the SDK stylesheets, `{ name, srcdoc }`, or `{ name, samples: [...] }` scored as one), `checks` (keep only findings whose check or category is listed, for example `['accessibility', 'touch-target']`), `themes` (default dark and light), `widths` (default 375 and 1024), `historyKey` (keeps runs in localStorage and shows the change since the last), `autorun`, `theme`, `height`. Returns `{ run(), results(), destroy() }`; `runTargets`, `openFrame` and `rankedTable` are exported too. A page on another origin cannot be read and scores as one `unreadable` error. The SDK's own Scorecard page runs its gallery samples through the same `runTargets` and adds the performance, scale and size-sweep sections. No element: a scorecard run is an action, not markup.

## Build and test

```
node tools/build.mjs        # regenerate plainkit.css, gallery data, dist/ (deterministic)
node tools/snapshot.mjs     # refresh site/files/snapshot.json for the Files page
node --test .               # unit, budget, security and API-surface tests
node tools/security.mjs     # scan for eval, inline handlers, secrets, unlisted innerHTML, ...
node site/scorecard/static-audit.mjs
```

## Add a component

1. Create `components/<name>/` and list it in `components/order.json`.
2. Write `<name>.html` (base example, then each variant and state as its own `<!-- @sample -->` fragment), `<name>.css` (tokens only),
   `<name>.js` only if it needs behaviour, `<name>.meta.json`, and `<name>.test.mjs` for behaviour.
3. Run `node tools/build.mjs`, then `node --test .`.

Rules the tests enforce: no literal colours in component CSS (tokens live in `tokens/tokens.css`), every class in a component's html is styled,
no inline scripts or event handlers, every `innerHTML` use is allow-listed with its markup source, the public surface (classes, tokens,
JS exports in `site/scorecard/api.baseline.json`) only grows, and size budgets in `site/scorecard/scoring.data.js`.

## Versioning

Semantic versioning is intended: removing or renaming a class, token or JS export is a major change (the API baseline test fails until it
is edited on purpose). Releases are not automated yet; `dist/manifest.json` and `site/scorecard/api.baseline.json` are kept ready for it.

## Licence

MIT. See `LICENSE`.
