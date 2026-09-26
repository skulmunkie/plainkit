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
- Text is `pk-text`, not a `<p>` or `<span>` with a class: a paragraph (`<pk-text tone="muted">`), a run inside a line (`<pk-text inline weight="semibold">`), a lead or eyebrow (`variant="lead"`, `variant="eyebrow"`), a mono figure (`font="mono"`). Real headings stay native `<h1>` to `<h6>` (they carry the heading role, level and outline); `variant="h1"` to `"h6"` is only the look, for text that should resemble a heading without being one. Layout is `pk-stack`, `pk-cluster` and `pk-grid`, not a styled `<div>`.
- Never use anything a reference marks **Deprecated**: it logs a warning once, and it is removed in the release named there; use what the table says.
- Nothing fails silently: mistakes are logged as warnings (see `references/logging.md`). When a tag does nothing, check the console for a `loader` or element warning. Saved state goes through `createStore` (`references/state.md`): bad or old data gives the defaults and one warning, and secrets never go in it. An app is made of modules (`defineModule`, `moduleFromMount` for an existing `mountX` tool, `createModuleHost`; `references/app.md`): only the app config lists the code a module load may import, and listeners and timers go through `ctx.on` and `ctx.after`.

## References (open on demand)

{{references}}

## Workflows

Below, `plainkit/` is a copy of `dist` next to your page (see `references/loading.md` for the release zip, NuGet and other ways).

### Choose before you build

Before writing markup for a page or a job, open `references/choosing.md` (decision path, use-case table, anti-patterns) and do this:

1. Name the page type or job, and find it in the use-case table.
2. Open what it names: a template (`templates.md`), else a layout (`layouts.md`), else patterns (`patterns.md`), else the element that names the job (`elements-index.md`). The frame around pages is `pk-app-shell` with `pk-side-nav` or `pk-navbar`.
3. Paste its markup into `<main>` and its page script (if shown) into your script file (the demo shell `mountChrome` is not part of it). Change only content, slots, props, `::part()`, `--pk-*` properties and tokens. Never copy an element's internals, add `!important` or wrap slotted content in a `display: contents` element.
4. Write your own (from `pk-stack`, `pk-cluster`, `pk-grid`, `pk-text`, tokens) only when nothing fits, say which gap it fills, and never invent a `pk-*` tag.

### Start a page

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
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
import { initPlainkit } from './plainkit/js/init.js'; initPlainkit();
```

`js/init.js` is the small entry, `initPlainkit` alone. `js/plainkit.js` is the same plus the dynamic-value, theming and colour helpers; import it instead if the page uses those too (see `references/loading.md`).

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

Add the dock to an existing app (Ctrl+` toggles it; tabs: Console, Logs, Logging, Performance, Quality, Inspector, Theme, Layout builder). Do it in development only. The tools are their own unit, the modules (`plainkit-modules-<version>.zip`, or `dist/modules/` in the NuGet package): unzip it into the runtime `dist` folder so it lands at `plainkit/modules/`, and the runtime zip alone (the elements) never carries a tool. Hosting the modules apart from the runtime is documented in `references/tools.md`.

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

The palette lists every element in `elements/api.json`, so a new element appears without a change. Selection, moving (Alt+arrows or the toolbar), duplicate, delete, undo and redo work by keyboard and touch; a pointer or touch drag on a row's handle reorders the top-level page, and a palette button drags onto the canvas to insert (slot-aware when it lands on a container); each element also gets an Edit/Delete chip on hover or selection. At phone width the toolbar row is hidden and dragging plus the chip are the whole interaction model. The inspector edits the selected element's props from its API metadata. `builder.getModel()` and `builder.toHtml()` are the outputs; the model is `js/layout-model.js` (`createRegistry`, `validateDoc`, `toHtml`, `fromHtml`), which refuses unknown tags, props, slots and enum values and never lets a script, style or event handler in. The full option list and handle are in `references/tools.md`.

### Enable logging

```js
import { createLogger, configureLogging } from './plainkit/js/log.js';

configureLogging({ level: 'info', scopes: { checkout: 'debug' }, routes: { error: ['console', 'toast'] } });
const log = createLogger('checkout');
log.info('order placed', { id: 42 });
```

Without code: `?pk-log=debug` in the address or `data-pk-log="debug"` on `<html>`. Levels, scopes, outputs and the viewer: `references/logging.md`.

### Build a page

A page tends to repeat the same bookkeeping: a title, a status/error notice, a busy overlay around an action, a breadcrumb trail. `createPage` is that as one small object, built from elements already in your markup — it never creates or owns them, only drives the props they already have; the one element it can create is the loading overlay, so you write no overlay markup. Busy is counted: every action holds a token, so two overlapping `page.busy(fn, label)` calls never clear each other: `page.isBusy` stays true until the last one ends and `page.busyLabel` is the most recent one still running. For work that is not a promise use `const end = page.begin('Saving…'); try { … } finally { end(); }` (`end` is safe to call twice); `page.onBusyChange(({ busy, label }) => …)` returns its unsubscribe. A rejection releases only its own token. The overlay created for `body` appears only after `BUSY_DELAY` (150 ms, so a fast action never flashes it) and stays at least `BUSY_MIN_TIME` (300 ms); pass `delay` and `minTime` to change them. It wraps `body` without moving it (no layout shift), sets `aria-busy` on it while any action runs, announces the label politely and never traps focus. `createPage({ fullscreen: true })` is the app-scope variant (a fullscreen overlay, nothing wrapped). An `overlay` element you placed yourself still works, driven at once (no delay) unless you pass `delay`. Labels are text, never markup. `page.destroy()` releases every token and timer and puts `body` back.

```js
import { createPage } from './plainkit/js/page.js';

const page = createPage({
    alert: document.getElementById('page-alert'),
    body: document.getElementById('page-body'),   // wrapped in a pk-loading-overlay the page creates and owns
    breadcrumb: document.getElementById('page-crumbs'),
    scope: 'orders',
});
page.setTitle('Orders');
page.setBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Orders' }]);
await page.busy(() => fetchOrders(), 'Loading orders…');
// a fetchOrders() rejection is logged (through js/log.js under the given scope), shown as a
// pk-alert danger status, and rethrown so your own error handling still runs
```

Do not hand-build the trail on every page: declare a route tree once with the vanilla router module and pass it in. `import { mountRouter } from './plainkit/modules/router/router.js'; const router = mountRouter(document.body, { routes: [{ path: '/', label: 'Home', children: [{ path: '/orders/:id', label: p => `Order ${p.id}` }] }], intercept: true }); createPage({ breadcrumb: crumbsEl, router })` sets the breadcrumbs (`Home > Order 7`, last crumb without `href`) and the title on `/orders/7` and on every route change; `page.destroy()` stops following. `label` is a string or `(params) => string`, `crumb: false` skips a route, and `router.navigate(path)`, `crumbs()`, `current()`, `subscribe(fn)` and `destroy()` are the handle. For an app on static hosting use hash mode, `mountRouter(el, { routes, mode: 'hash' })`: addresses are `#/<path>?<query>`, an unknown address is a normal match with `status` 404 (never null, never an exception), and `current()` is `{ path, url, params, query, label, status }`. `guard: route => true | { allow: false, redirect }` runs before anything is rendered and denies (status 403) on anything but `true` or a throw; a redirect is followed only when it is an app-relative path. `aliases: { '/elements/:name': '/gallery/elements/:name' }` keeps old addresses working (params and query carry over), `notFound` or a `{ path: '*' }` route sets the not-found page, and `navigate(to, { replace })` refuses anything that is not an app-relative path. Route params and query are untrusted text: put them in with `textContent`. A Blazor app keeps `NavigationManager`; this is for the vanilla SDK.

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

### Upgrade this app to a newer Plainkit

`references/upgrading.md` is a blast-radius recipe, not a changelog summary. While you are in the app, also check it against `references/choosing.md`: a hand-built table, modal, header search or record page that a newer element or template now covers is worth replacing. Recipe: find the installed and target versions, read `CHANGELOG.md` between them (Breaking/Removed/Changed first), grep this app for what those entries name, and turn the matches into a severity-ordered checklist. Do the mechanical renames; flag what needs a judgment call.

### Share a context menu across targets

A UI with several always-visible per-row or per-card icon buttons competing for space is the signal: wrap the region in one `pk-context-menu` instead of a button row. It opens on right-click, Shift+F10/the Menu key or a touch long-press; `pk-open`'s detail names what was targeted (`context`, the nearest ancestor's `data-pk-context` value; `pk-table` sets one per `<tr>` already) so the handler can rebuild the `menu` slot before it paints.

```js
menu.addEventListener('pk-open', e => {
    menu.querySelectorAll('[slot="menu"]').forEach(n => n.remove());
    for (const item of menuItemsFor(e.detail.context)) { item.slot = 'menu'; menu.append(item); }
});
```

## What is not built

`references/known-gaps.md` lists what does not exist and what not to assume (the Guides are a first set of seven with no search yet, no reactive template layer, no reordering inside a layout builder container by drag, and no on-screen Save in the layout builder at phone width).
