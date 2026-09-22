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

The release zip comes with `manifest.json`, which lists every file with its size and an SRI hash, so you can pin what you serve. The dev tools (theme editor, logs, the dock) are a separate download, `plainkit-modules-<version>.zip`: unzip it into the same folder and it lands at `plainkit/modules/` with a manifest of its own; a page that only uses elements never needs it. The examples below assume you unzipped the release into a folder called `plainkit/` next to your page. If you serve the Pages site instead, replace `plainkit/` with that URL prefix.

> [!note] The SDK makes no request to any other origin. Every file it loads comes from the folder you host, so it works under a strict Content Security Policy (`script-src 'self'; style-src 'self'`).

## Wire a page

A page needs one stylesheet and one call. Put the call in a script file, not in an inline `<script>` element: an inline script is blocked by a strict policy, and Plainkit itself never needs one.

```html
<link rel="stylesheet" href="plainkit/plainkit.min.css">
<link rel="modulepreload" href="plainkit/js/loader.js">
<link rel="modulepreload" href="plainkit/js/log.js">
<link rel="modulepreload" href="plainkit/elements/registry.js">
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
  <link rel="modulepreload" href="plainkit/elements/registry.js">
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

Each element is its own module in `plainkit/elements/<name>.js`, mapped by `plainkit/elements/registry.js`. `initPlainkit()` imports only the modules of the tags your page uses, so a page with a button and a card downloads two small files. Until an element has loaded, its tag is hidden by the stylesheet, so a page does not flash unstyled markup.

## Themes and density

Set `data-theme="dark"` or `data-theme="light"` on `<html>`, or on any element to theme just that part. Add `data-density="compact"` for a denser layout. Both are token sets, not extra stylesheets. To change a colour or a spacing value, override a token: [Theming and tokens](theming.md) shows how.

## Where to go next

- The [gallery](../gallery/index.html) shows every element with live examples and its API.
- [Theming and tokens](theming.md) covers the design tokens and how to change them.
- [Logging](logging.md) covers the one logger the SDK and your own code share.
- The agent skills carry a reference for every element: [elements-index.md](../../dist/skills/plainkit-sdk/references/elements-index.md) lists them by group.
