---
title: Getting started with the SDK
order: 1
summary: Get the files, link one stylesheet, call initPlainkit once, and build a first page from pk-* elements. No build step, no dependencies.
---

Plainkit is a set of custom elements (`pk-card`, `pk-button`, `pk-table` and dozens more) plus one stylesheet of design tokens. There is nothing to compile and nothing to install at run time: you copy a folder, link a stylesheet and call one function. This guide takes a plain HTML page from nothing to a working first page. To use Plainkit from Blazor, read [Getting started with Blazor](getting-started-blazor.md) instead.

## Get the files

Everything a page needs is one folder, `dist`. It is generated, and it is not committed to git, so there is no link that points at a git tag. Pick one of these:

| Way | Version | Good for |
|---|---|---|
| Link to the Pages site: `https://skulmunkie.github.io/plainkit/dist/plainkit.min.css` (the modules sit next to it) | the latest `main`, not pinned | trying it out |
| Download `plainkit-dist-<version>.zip` from the GitHub release and copy it anywhere | pinned | a page you ship |
| `dotnet add package PlainKit.Blazor` | pinned | a Blazor app (the package carries `dist` as static web assets) |
| `npm install plainkit` | pinned | only if the maintainers have published to npm |

The release zip comes with `manifest.json`, which lists every file with its size and an SRI hash, so you can pin what you serve. The dev tools (theme editor, logs, the dock) are a separate download, `plainkit-modules-<version>.zip`: unzip it into the same folder and it lands at `plainkit/modules/` with a manifest of its own; a page that only uses elements never needs it. If you want core lean, take `plainkit-<version>.zip` (core without the dev tools' helper files) plus the extras you use (`plainkit.tools-<version>.zip` for the dev tools, `plainkit.canvas-<version>.zip` for `pk-canvas` and the SVG toolkit, `plainkit.markdown-<version>.zip` for `pk-markdown` and `pk-markdown-editor`, `plainkit.dock-<version>.zip` for `pk-dock`) instead of the two downloads above, each unzipped over the core folder; the Pages site serves the same split under `packages/<id>/`. Core alone has no `<pk-canvas>`, `<pk-dock>`, `<pk-markdown>` or `<pk-markdown-editor>`: the full download and `dist/` keep every old path. Both shapes are first class and load the same way. The examples below assume you unzipped the release into a folder called `plainkit/` next to your page. If you serve the Pages site instead, replace `plainkit/` with that URL prefix. `elements/api.json` (the element API, read only by the dev tools) is in `plainkit.tools-<version>.zip` and the full zip, not in core or the npm package. Editor typings and IDE metadata (`elements.d.ts`, `custom-elements.json`, `web-types.json`) are in the full zip and in `plainkit.ide-<version>.zip`, not in the npm package.

> [!note] The SDK makes no request to any other origin. Every file it loads comes from the folder you host, so it works under a strict Content Security Policy (`script-src 'self'; style-src 'self'`).

## Wire a page

A page needs one stylesheet and one call. Put the call in a script file, not in an inline `<script>` element: an inline script is blocked by a strict policy, and Plainkit itself never needs one.

```html
<link rel="stylesheet" href="plainkit/plainkit.min.css">
<link rel="modulepreload" href="plainkit/js/loader.js">
<link rel="modulepreload" href="plainkit/js/log.js">
<link rel="modulepreload" href="plainkit/js/element.js">
<link rel="modulepreload" href="plainkit/js/element-core.js">
<script type="module" src="app.js"></script>
```

```js
import { initPlainkit } from './plainkit/js/init.js';
initPlainkit();
```

Importing the module is not enough: `initPlainkit()` has to be called. It installs the declarative openers (`data-open`, `data-toggle`, `data-close`), finds the `pk-*` tags on the page, loads the module of each element it finds, and keeps watching for tags added later.

`js/init.js` is the small entry: `initPlainkit` and nothing else it does not need. `js/plainkit.js` is the same, plus the dynamic-value, theming and colour helpers, in case you use those too; import it instead of `js/init.js` if you do. The five `modulepreload` links are optional: without them the browser still finds and fetches the same files, but one at a time, each after the last one that named it (the loader, then the registry, then an element's own module, then the two modules every element shares). The links let the browser fetch them in parallel instead, so the first element on the page upgrades sooner. `elements/registry.js` and the loader are worth preloading on every page that uses elements; the exact element modules are not, since which ones a page needs depends on its markup.

## A first page

This page has a card, a switch and a dialog. Nothing in it needs code except reading the switch:

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My first page</title>
  <link rel="stylesheet" href="plainkit/plainkit.min.css">
  <link rel="modulepreload" href="plainkit/js/loader.js">
  <link rel="modulepreload" href="plainkit/js/log.js">
  <link rel="modulepreload" href="plainkit/js/element.js">
  <link rel="modulepreload" href="plainkit/js/element-core.js">
</head>
<body>
  <main>
    <pk-card heading="Notifications">
      <pk-switch id="notify" checked>Email me about new orders</pk-switch>
      <p id="status">Notifications are on.</p>
      <pk-button slot="actions" variant="ghost" data-open="#help">Help</pk-button>
    </pk-card>

    <pk-dialog id="help" heading="About notifications">
      <p>We send one email a day at most.</p>
      <pk-button slot="footer" data-close>Close</pk-button>
    </pk-dialog>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

```js
import { initPlainkit } from './plainkit/js/init.js';

initPlainkit();

document.getElementById('notify').addEventListener('pk-change', event => {
    document.getElementById('status').textContent = event.detail.checked ? 'Notifications are on.' : 'Notifications are off.';
});
```

Three things to notice:

- **Attributes are the API.** `heading`, `variant` and `checked` are the element's props. A prop with a fixed set of values, such as `variant`, is checked, and a wrong value falls back to its default with a warning in the console (see [Logging](logging.md)).
- **Slots place content.** `slot="actions"` puts the button in the card's header, `slot="footer"` in the dialog's footer.
- **Events are named `pk-<thing>`.** A control that the user changes tells you with a commit event that carries the new value in `event.detail` (`pk-change` gives `{ checked }`). Until then the element owns the value; after the event it is yours.

## How elements load

Each element is its own module in `plainkit/elements/<name>.js`, found by name (`pk-card` is `plainkit/elements/card.js`; `registry.js` lists them for tools and error messages, and the page never fetches it). `initPlainkit()` imports only the modules of the tags your page uses, so a page with a button and a card downloads two small files. Until an element has loaded, its tag is hidden by the stylesheet, so a page does not flash unstyled markup.

### What has to stay where

The files find each other by relative address, worked out in the browser, so serve `dist` with its folders as they are, under one base URL:

- The loader (`js/loader.js`) imports `<pk-name>` as `elements/<name>.js`, from the `elements` folder next to `js`.
- Every module imports what it needs relative to itself (`elements/*.js` import `../js/...`), and some features load later the same way (from `js/`, `js/app/` and `modules/`).
- The icons are one file, `icons.svg`, at the top of `dist`, found relative to the module that draws an icon.
- The per-page bundle below needs its `chunks/` folder next to `plainkit.bundle.js`.

A host that only serves one flat folder of files (Shopify theme assets, for example) cannot run `dist` unchanged: build a page bundle with `--flat` instead (next section), which puts every file it needs in one folder. Do not patch or rename the built files: the minified output changes in every release.

## Ship one small request

For production you can replace the lazy loading with a per-page bundle. The tool reads the `pk-*` tags in a page and writes `plainkit.bundle.js` (the init entry plus exactly those elements), `plainkit.bundle.css` and a `chunks/` folder (the code the entry shares with the features an element loads on demand, such as a table's editing, which stays lazy):

```bash
node core/tools/bundle-page.mjs --html index.html --out public/plainkit
# instead of --html: --elements pk-button,pk-input
# also: --app (app framework), --full (theme and colour helpers), --dist node_modules/plainkit/dist (an installed package)
# a flat host (one folder, no sub-folders): add --flat, e.g. --flat --out theme/assets
```

The page then makes about ten requests instead of 20 to 27 and sends about a fifth fewer bytes, because fewer, larger files compress better than many small ones. Publish the whole output folder (the `chunks/` folder must sit next to the script), link the stylesheet, load the script as a module and call the exported `initPlainkit()` from your own script file, as above. The tool needs esbuild (`npm i -D esbuild`); it is not a dependency of the package.

With `--flat` there is no `chunks/` folder: the output is `plainkit.bundle.js`, `plainkit.bundle.css`, `plainkit-*.js` chunks, `plainkit-icons.svg` and `plainkit-registry.js`, all in the one folder, and the bundle finds the icons and the registry beside itself, wherever that folder is served (on Shopify, upload them as theme assets and link the stylesheet and your page script with the `asset_url` filter). Upload every `plainkit-*` file of a build together and remove the previous build's chunks: their names change when the code does. A `pk-*` tag that is not in the bundle cannot load from a flat folder; the console says `could not load <pk-name>`: build again with that tag.

## Themes and density

Set `data-theme="dark"` or `data-theme="light"` on `<html>`, or on any element to theme just that part. Add `data-density="compact"` for a denser layout. Both are token sets, not extra stylesheets. To change a colour or a spacing value, override a token: [Theming and tokens](theming.md) shows how.

## Where to go next

- [Choosing what to build with](choosing-what-to-build-with.md) says when to start from a template, a layout, a pattern or an element instead of writing your own markup: read it before you build a page.
- The [gallery](../../app.html#/gallery) shows every element with live examples and its API.
- [Theming and tokens](theming.md) covers the design tokens and how to change them.
- [Logging](logging.md) covers the one logger the SDK and your own code share.
- The agent skills carry a reference for every element: [elements-index.md](https://skulmunkie.github.io/plainkit/skills/plainkit-sdk/references/elements-index.md) lists them by group.
