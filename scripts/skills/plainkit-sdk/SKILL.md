---
name: plainkit-sdk
description: Build web pages and apps with the Plainkit SDK, a dependency-free UI toolkit of pk-* custom elements (pk-button, pk-input, pk-dialog, pk-table, pk-app-shell and about {{elementCount}} more), CSS tokens and small ES modules, with no framework and no build step. Use it when a project links plainkit.css or plainkit.js, uses pk-* tags, or the user asks for a Plainkit page, form, dialog, layout, page template, theme, the Plainkit dev tools dock, logs viewer or logging (createLogger, ?pk-log=). Look elements, props, slots and events up in the references instead of guessing. For Blazor apps use the plainkit-blazor skill.
---

# Plainkit SDK

{{stamp}}

Plainkit is plain HTML, CSS custom properties and ES modules. Components are custom elements (`pk-*`) that load on demand; there is no framework, no build step and no runtime request to another origin.

## Rules

- Use only elements, props, slots and events that appear in the references. Never invent a `pk-*` tag or an attribute: open `references/elements-index.md`, find the tag, and open the file it names. If a component you need does not exist, say so.
- Props are attributes in kebab-case (`hide-close`) or properties in camelCase (`hideClose`); a boolean prop is present or absent. Events are `addEventListener('pk-...')` and carry a `detail`.
- No inline `style` attributes, `<style>` elements, inline event handlers or inline scripts (the toolkit runs under `script-src 'self'; style-src 'self'`). Put scripts in files; style with props, `::part()`, CSS custom properties and tokens from a stylesheet.
- No literal colours: use the tokens (`references/theming.md`). No literal breakpoint widths in scripts: use the named breakpoints (same file, "Breakpoints"). The old class-based components (`.btn`, `.card`, `.modal-*`) no longer exist.
- Never use anything a reference marks **Deprecated**: it logs a warning once, and it is removed in the release named there; use what the table says.
- Nothing fails silently: mistakes are logged as warnings (see `references/logging.md`). When a tag does nothing, check the console for a `loader` or element warning.

## References (open on demand)

{{references}}

## Workflows

Below, `plainkit/` is a copy of `dist` next to your page (see `references/loading.md` for the release zip, NuGet and other ways).

### Start a page

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My app</title>
<link rel="stylesheet" href="plainkit/plainkit.min.css">
<script type="module" src="app.js"></script>
</head>
<body>
<main>
<pk-page-header heading="Settings" level="1"></pk-page-header>
</main>
</body>
</html>
```

```js
// app.js
import { initPlainkit } from './plainkit/js/plainkit.js';
initPlainkit();
```

### Add a page

Pick the closest starting point: `references/layouts.md` (list, record, setup, tool, wizard anatomies), `references/templates.md` (full pages: crud, dashboard, form, wizard, workspace, auth, ...) or `references/patterns.md` (confirm delete, filter table, forms, notifications, ...). Copy its markup into `<main>`, keep the page script if one is shown, replace the text and data. For the frame around pages use `pk-app-shell` with `pk-side-nav` or `pk-navbar` (`references/elements-layout.md`, `references/elements-navigation.md`).

### Start from a template

1. Open `references/templates.md`, choose the template by its summary.
2. Paste its markup into your page and its page script into your script file (the demo shell `mountChrome` is not part of it).
3. Look up every element you change in `references/elements-index.md`.

### Add a form

```html
<pk-form summary>
  <form id="settings">
    <pk-form-section heading="Profile" description="Shown on invoices.">
      <pk-field label="Business name" required><pk-input name="name" required></pk-input></pk-field>
      <pk-field label="Website" help="Include https://"><pk-input name="website" type="url"></pk-input></pk-field>
      <pk-field label="Plan"><pk-select name="plan"><option value="free">Free</option><option value="pro">Pro</option></pk-select></pk-field>
    </pk-form-section>
    <pk-form-actions align="end">
      <pk-button variant="ghost" type="reset">Reset</pk-button>
      <pk-button type="submit">Save</pk-button>
    </pk-form-actions>
  </form>
</pk-form>
```

```js
document.getElementById('settings').addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    console.log(values);
});
```

`pk-form` shows the browser's validation messages in each field and a summary; the controls are form-associated, so `FormData` sees them by `name`. Field and control details: `references/elements-form-layout.md`, `references/elements-form-controls.md`.

### Link that looks like a button

A control that navigates is a link, not a click handler: give `pk-button` an `href` and it renders a real anchor with the same variants, sizes and icons (middle and ctrl-click, the status-bar URL and Enter work natively; Space does not activate a link).

```html
<pk-button href="/reports">Open reports</pk-button>
<pk-button href="https://example.com/help" target="_blank" variant="secondary">Help</pk-button>
<pk-button href="/export.csv" download="export.csv" variant="ghost">Download</pk-button>
```

`target`, `rel` (`noopener` is the default for `_blank`) and `download` only apply with `href`. `disabled` and `busy` drop the href and report `aria-disabled`. A link still fires `click`, so a host can track it.

### Icon-only button

Write an icon button like any other button, with its name as the text, and add `icon`: the text is hidden visually and stays the accessible name (and the hover tooltip); only the icon is drawn. `icon-name` draws a sprite symbol for you; a `pk-icon` or an svg in the button works too. `label` overrides the text. An icon button with no name at all fails the scorecard.

```html
<pk-button icon variant="ghost" icon-name="plus">Add item</pk-button>
<pk-button icon variant="ghost" href="/orders"><pk-icon name="chevron-left"></pk-icon>Back to Orders</pk-button>
```

`busy` swaps the icon for the spinner and keeps the name; `toggle` keeps `aria-pressed`. Inside a `pk-tooltip` the tooltip shows the name instead of the native title.

### Open a dialog

```html
<pk-button data-open="#confirm">Delete</pk-button>
<pk-dialog id="confirm" heading="Delete this item?" size="sm">
  <p>This cannot be undone.</p>
  <pk-button slot="footer" variant="ghost" data-close>Cancel</pk-button>
  <pk-button slot="footer" variant="warn" id="confirm-delete" data-close>Delete</pk-button>
</pk-dialog>
```

`data-open`, `data-toggle` and `data-close` need no script (`references/openers.md`). To ask from code, `PkDialog.confirm({ heading, message, danger })` returns a promise of a boolean, and `PkToast.show(message, { kind })` shows a toast. `PkDialog` exists once a `pk-dialog` has connected and `PkToast` once a `pk-toast-stack` has, so have one of them in the page (empty is fine).

### Wire the dev tools

Add the dock to an existing app (Ctrl+` toggles it; tabs: Console, Logs, Logging, Performance, Quality, Inspector, Theme). Do it in development only. The tools are their own unit, the modules (`plainkit-modules-<version>.zip`, or `dist/modules/` in the NuGet package): unzip it into the runtime `dist` folder so it lands at `plainkit/modules/`, and the runtime zip alone (the elements) never carries a tool. Hosting the modules apart from the runtime is documented in `references/tools.md`.

```js
import { mountDevTools } from './plainkit/modules/devtools/devtools.js';

if (location.hostname === 'localhost') {
    const tools = await mountDevTools(null, { mode: 'dock', size: 'medium' });
    tools.select('logs');
}
```

Options, the handle, custom panels and every other tool (`mountLogs`, `mountScorecard`, `mountThemeEditor`, ...): `references/tools.md`.

### Let people build pages with the layout builder

Pages built by your users (or by your team) from the SDK's own elements, kept as JSON and exported as CSP-safe markup. The host stores the page; the builder stores nothing.

```js
import { mountLayoutBuilder } from './plainkit/modules/layout-builder/layout-builder.js';

const builder = await mountLayoutBuilder(document.getElementById('editor'), {
    html: startingMarkup,   // or model: a saved document
    onchange: ({ model, reason }) => keepDraft(model),
    onsave: ({ model, html }) => savePage(model, html),
});
```

The palette lists every element in `elements/api.json`, so a new element appears without a change. Selection, moving (Alt+arrows or the toolbar), duplicate, delete, undo and redo work by keyboard and touch; the inspector edits the selected element's props from its API metadata. `builder.getModel()` and `builder.toHtml()` are the outputs; the model is `js/layout-model.js` (`createRegistry`, `validateDoc`, `toHtml`, `fromHtml`), which refuses unknown tags, props, slots and enum values and never lets a script, style or event handler in. The full option list and handle are in `references/tools.md`.

### Enable logging

```js
import { createLogger, configureLogging } from './plainkit/js/log.js';

configureLogging({ level: 'info', scopes: { checkout: 'debug' }, routes: { error: ['console', 'toast'] } });
const log = createLogger('checkout');
log.info('order placed', { id: 42 });
```

Without code: `?pk-log=debug` in the address or `data-pk-log="debug"` on `<html>`. Levels, scopes, outputs and the viewer: `references/logging.md`.

### Respond to screen size

The elements already respond at the named breakpoints ({{breakpoints}} px, desktop-first: a rule applies at that width and below); do not restyle them there. In your own stylesheet use the literal query with the same width (`@media (max-width: 640px)`); custom properties do not work in `@media`. In a script never write the number: `import { mediaBelow } from './plainkit/js/breakpoints.js'; mediaBelow('phone').matches` (it reads `--pk-bp-phone` from `plainkit.css`). Other widths need a rebuilt `dist`: see "Ship a custom SDK" below; the table of what changes at each width is in `references/theming.md`.

### Ship a custom SDK

A consumer's theme and breakpoint widths are two independent choices, both made in the theme editor's **Custom SDK** tab (`mountThemeEditor(el)`; the Theme page of the site has it). Do not hand-edit `dist` to change a width: the tab does it with checked transforms.

1. **Only colours and styles (the common case):** tick Theme, untick Breakpoints, export. The zip is `plainkit-theme.css` (load it after `plainkit.css`: `<link rel="stylesheet" href="plainkit-theme.css">`), `plainkit.custom.json` and a `README.md`; no SDK file changes. Blazor: put the file in `wwwroot` and link it after the PlainKit stylesheet in `App.razor` or `_Host.cshtml`. The Download plainkit-theme.css button gives just the stylesheet.
2. **Different breakpoint widths:** tick Breakpoints (whole px 320 to 2560, ascending, at least 64 apart; `phone`, `tablet`, `wide` keep their names). The table shows which elements and properties change at each and which viewport widths flip. The export is a zip of `dist/` with every `@media` width, `--pk-bp-*` and the report rewritten and `manifest.json` recomputed (size and SHA-384 per file), (with `dist/modules/` too when the modules are deployed next to the runtime; each unit has its own recomputed manifest), plus `plainkit.custom.json` and a `README.md` naming the version and the settings. Tick Theme as well and the theme is also baked into `plainkit.css` and `plainkit.min.css`.
3. **Change it again later:** paste `plainkit.custom.json` into the tab's Import box.
4. Use the exported `dist/` wherever the release `dist` is used and keep scripts on `js/breakpoints.js` (it reads `--pk-bp-*`), never a literal width. It all runs in the browser with same-origin reads of the shipped files, each checked against its release hash; nothing leaves the page. A Blazor exporter is not built yet: `PkThemeEditor` shows the same tab, and its theme-only zip is the way to ship a theme in a Blazor app.

### Change the theme

`data-theme="dark|light"` and `data-density="compact"` on `<html>` or any element. Override tokens in a stylesheet loaded after `plainkit.css` (`references/theming.md` lists every token).

## What is not built

`references/known-gaps.md` lists what does not exist and what not to assume (the Guides are a first set of five with no search yet, no reactive template layer, no pointer drag and drop in the layout builder).
