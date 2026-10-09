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
- Text is `pk-text`, not a `<p>` or `<span>` with a class: a paragraph (`<pk-text tone="muted">`), a run inside a line (`<pk-text inline weight="semibold">`), a lead or eyebrow (`variant="lead"`, `variant="eyebrow"`), a mono figure (`font="mono"`). Real headings stay native `<h1>` to `<h6>` (they carry the heading role, level and outline); `variant="h1"` to `"h6"` is only the look, for text that should resemble a heading without being one. Layout is `pk-stack`, `pk-cluster` and `pk-grid`, not a styled `<div>`. A bulleted or numbered prose list is `pk-list` (`ordered`, `marker`: `auto`/`disc`/`decimal`/`check`/`none`, `gap`, `dense`), items as plain elements (a `span`, an `a`, `pk-text inline`) never a raw `ul`, `ol` or `li`. A max-width, padded content region (a doc-like page, a gallery stage, a code view) is `pk-container` (`size` `sm`/`md`/`lg`/`full` on the `--content-*` tokens, `padding` on the space scale, `scroll` `y`/`both` for a region that scrolls on its own — it needs `label` and gets `tabindex=0`/`role=region`), not a hand-styled `<div>` with `max-width`, padding and `overflow`.
- A built-in page type's `heading` (and `pk-page-header`'s `title` slot) is a light-DOM `<pk-heading level="1">`, a real heading in its own shadow tree: `querySelector('h1')` does not find it, so select `h1, pk-heading[level="1"]` (what `mountApp` focuses after navigation; the page shell gives it `tabindex="-1"`). Blazor's `PkPageHeader` draws the same slotted `pk-heading` for `Title`. The `record` page type asks before an in-app leave with unsaved edits (link, breadcrumb, back/forward: `ctx.dialogs.confirm`, Stay keeps the page, edits and address; a Save that navigates itself and `ctx.navigate` are not asked): nothing to configure.
- Never use anything a reference marks **Deprecated**: it logs a warning once, and it is removed in the release named there; use what the table says.
- Nothing fails silently: mistakes are logged as warnings (see `references/logging.md`). When a tag does nothing, check the console for a `loader` or element warning. Saved state goes through `createStore` (`references/state.md`): bad or old data gives the defaults and one warning, and secrets never go in it. An app is made of modules (`defineModule`, `createModuleHost`; `references/app.md`), long work is a task (never a hand-built toast or progress bar), and messages and questions go through `ctx.notify`/`ctx.dialogs` (never hand-built toast or dialog markup) — see `references/app.md`, "Tasks" and "Notifications and dialogs".

## References (open on demand)

{{references}}

## Workflows

Below, `plainkit/` is a copy of `dist` next to your page (see `references/loading.md` for the release zip, NuGet and other ways).

### Choose before you build

Before writing markup for a page or a job, open `references/choosing.md` (decision path, use-case table, anti-patterns) and do this:

1. Name the page type or job, and find it in the use-case table.
2. Open what it names: a template (`templates.md`), else a layout (`layouts.md`), else patterns (`patterns.md`), else the element that names the job (`elements-index.md`; a paged, searchable, selectable list is `pk-data-table` and selecting across pages `pk-table` with `total`: `patterns.md`; a form field that picks one or several records from a long list is `pk-lookup-picker`, whose `load(query)` is the data-table's, not a `pk-combobox` with thousands of options). The frame around pages is `pk-app-shell` with `pk-side-nav` or `pk-navbar`; an app of several parts is `mountPage`/`mountApp` and page types with no markup of your own (workflow **Build an app**, `references/build-an-app.md`; API in `references/app.md`). Blazor has no app framework surface yet.
3. Paste its markup into `<main>` and its page script (if shown) into your script file (the demo shell `mountChrome` is not part of it). Change only content, slots, props, `::part()`, `--pk-*` properties and tokens. Never copy an element's internals, add `!important` or wrap slotted content in a `display: contents` element.
4. Write your own (from `pk-stack`, `pk-cluster`, `pk-grid`, `pk-text`, tokens) only when nothing fits, say which gap it fills, and never invent a `pk-*` tag. Never put a list and its record on one page (it scrolls three ways and the record is off screen): they are two routed pages, template `routed-pair` (page types `list` and `record`), and a peek at context is a flyout (`pk-drawer`); "Which list shape" in `references/choosing.md`.

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

A create-or-edit record page (toolbar with Cancel, Delete and Save, tabs, an error alert, a sidebar) is `pk-record-form` around your own `<form>`: `<pk-record-form cancellable deletable error=""><form>...</form><pk-card slot="sidebar">...</pk-card></pk-record-form>`. Listen for `pk-record-save` (it fires only once `pk-form` found the form valid), `pk-record-cancel` and `pk-record-delete`; set `busy` and `error` while and after you save, and call its `submit()` from a Save button in the page header (`actions-in-header`). It owns no values or save logic; the toolbar buttons fold to icons on a phone.

### Link that looks like a button

A control that navigates is a link, not a click handler: give `pk-button` an `href` and it renders a real anchor with the same variants, sizes and icons (middle and ctrl-click, the status-bar URL and Enter work natively; Space does not activate a link).

```html
<pk-button href="/reports">Open reports</pk-button>
<pk-button href="https://example.com/help" target="_blank" variant="secondary">Help</pk-button>
<pk-button href="/export.csv" download="export.csv" variant="ghost">Download</pk-button>
```

`target`, `rel` (`noopener` is the default for `_blank`) and `download` only apply with `href`. `disabled` and `busy` drop the href and report `aria-disabled`. A link still fires `click`, so a host can track it. For a text link in prose, `pk-link` is a real anchor instead: `href` for an ordinary address, or `to` for an app route (a plain click emits a cancelable `pk-navigate` that `mountRouter({ intercept: true })`/`mountApp` picks up like a plain `<a href>`, falling back to a normal navigation outside an app); `variant` is `inline`/`muted`/`plain`, `current` sets `aria-current="page"`.

### Icon-only button

Write an icon button like any other button, with its name as the text, and add `icon`: the text is hidden visually and stays the accessible name (and the hover tooltip); only the icon is drawn. `icon-name` draws a sprite symbol for you; a `pk-icon` or an svg in the button works too. `label` overrides the text. An icon button with no name at all fails the scorecard.

To show icon and text on a large screen and only the icon on a small one, give a button with an icon `collapse="phone"` (icon only on a phone) or `collapse="tablet"` (icon only on a tablet and a phone). The text stays the accessible name; a button with no icon never collapses.

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

```js
import { mountDevTools } from './plainkit/modules/devtools/devtools.js';

if (location.hostname === 'localhost') {
    const tools = await mountDevTools(null, { mode: 'dock', size: 'medium' });
    tools.select('logs');
}
```

Development only (Ctrl+\` toggles it). The tools are their own unit, `dist/modules/`: unzip `plainkit-modules-<version>.zip` into the runtime `dist` folder so it lands at `plainkit/modules/`. Options, the handle, custom panels and every other tool (`mountLogs`, `mountScorecard`, `mountThemeEditor`, ...): `references/tools.md`.

`mountDevTools` is itself a thin consumer of `mountToolDock` (`./plainkit/modules/tool-dock/tool-dock.js`), the generic floating/docked tabbed panel underneath it — a single tool panel that docks to the bottom of the page or fills a container, toggled by a hotkey, resizable between named sizes, given its own `panels` (`{ id, title, mount(el, context) }`, same shape as `mountDevTools`'s). Point it at your own app content (`mountToolDock(null, { mode: 'dock', panels, label: 'My tools', launcherLabel: 'Tools' })`) when you want that pattern — a canvas/record/page as the main surface with tool-type panels (properties, history, an outline, a console, a chat) docked around it — for something other than the dev tools. It is not `pk-dock`: `pk-dock` is the multi-pane workspace element (Palette | Canvas | Properties, drag-to-dock, layout builder's own chrome above), while `mountToolDock` is one floating tabbed panel, not a workspace of panes. In your own markup the same job is the `pk-tray` element: `<pk-tray label="Tools" launcher-label="Open tools" hotkey="Ctrl+`" sizes>...</pk-tray>` pins a non-modal panel to a viewport edge (`edge`: bottom, top, start, end; `size`: small, medium, large) with a floating launcher and no focus trap, closes on Escape inside it, Close or the launcher, and reports `pk-open`, `pk-close` (cancelable) and `pk-size-change` (Blazor: `PkTray`, `@bind-Open`, `@bind-Size`); use `pk-drawer` instead when the panel should be modal.

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

The palette lists every element in `elements/api.json`, so a new element appears without a change. The chrome is a `pk-dock` (Palette, Structure and HTML tabs | canvas | Properties: resize, drag or use the Move menu to move a panel between groups, close and reopen panels) with File (Save, only when `onsave` is given) and Edit menus in its toolbar, each item showing its shortcut. Selection, moving (Alt+arrows or Edit > Move), duplicate, wrap, delete, undo and redo work by keyboard, menu and touch; right click (or Shift+F10, or a long press) on a canvas element opens its element menu, and on a palette button offers Add; a pointer or touch drag on a row's handle reorders the top-level page, and a palette button drags onto the canvas to insert (slot-aware when it lands on a container); each element also gets an Edit/Delete chip on hover or selection. At phone width the dock becomes one tab strip and the File and Edit menus stay in its toolbar, so Save is reachable by touch. The inspector edits the selected element's props from its API metadata. `builder.getModel()` and `builder.toHtml()` are the outputs; the model is `js/layout-model.js` (`createRegistry`, `validateDoc`, `toHtml`, `fromHtml`), which refuses unknown tags, props, slots and enum values and never lets a script, style or event handler in. The full option list and handle are in `references/tools.md`.

### Enable logging

```js
import { createLogger, configureLogging } from './plainkit/js/log.js';

configureLogging({ level: 'info', scopes: { checkout: 'debug' }, routes: { error: ['console', 'toast'] } });
const log = createLogger('checkout');
log.info('order placed', { id: 42 });
```

Without code: `?pk-log=debug` in the address or `data-pk-log="debug"` on `<html>`. Levels, scopes, outputs, the viewer and measuring a page's own load metrics (`measurePage`): `references/logging.md`.

### Build a page

`createPage` gives a page the bookkeeping it always needs (title, busy overlay, breadcrumb trail, a status alert) built from elements already in your markup: it never creates or owns them, only drives their props (the one exception is the loading overlay it creates for you).

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

Busy is counted (overlapping calls never clear each other early), the overlay delays and debounces itself, and `page.destroy()` releases everything. Driving breadcrumbs from a route tree (`mountRouter`), a `pk-card` whose body the page fills with a loading, empty or error state (`showState`) and `pk-property-grid` (a live property inspector): `references/page.md`.

### Respond to screen size and change the theme

The elements already respond at the named breakpoints ({{breakpoints}} px, desktop-first); do not restyle them there. `data-theme="dark|light"` and `data-density="compact"` on `<html>` or any element; override tokens in a stylesheet loaded after `plainkit.css`. Reading a breakpoint from script (`mediaBelow`), the literal media-query widths and every token: `references/theming.md`.

### Ship a custom SDK

A consumer's theme and breakpoint widths are two independent choices, both made in the theme editor's **Custom SDK** tab (`mountThemeEditor(el)`), never by hand-editing `dist`. Colours and styles alone export a small `plainkit-theme.css` to load after `plainkit.css`; different breakpoint widths export a whole rebuilt `dist/` zip. Steps, the zip contents and the Blazor equivalent (`PkThemeEditor`): `references/custom-sdk.md`.

### Upgrade this app to a newer Plainkit

`references/upgrading.md` is a blast-radius recipe, not a changelog summary. While you are in the app, also check it against `references/choosing.md`: a hand-built table (an editable grid is `pk-table` with `editable` and per-column `editor`s, cancelable `pk-cell-edit`, Ctrl+Z / Ctrl+Y undo and redo also go through that event), modal, header search or record page that a newer element or template now covers is worth replacing. Recipe: find the installed and target versions, read `CHANGELOG.md` between them (Breaking/Removed/Changed first), grep this app for what those entries name, and turn the matches into a severity-ordered checklist. Do the mechanical renames; flag what needs a judgment call.

### Share a context menu across targets

Several always-visible per-row or per-card icon buttons competing for space is the signal: wrap the region in one `pk-context-menu` (opens on right-click, Shift+F10 or a touch long-press) instead of a button row. Its `pk-open` detail names what was targeted (`context`, the nearest ancestor's `data-pk-context`; `pk-table` sets one per row already), so the handler rebuilds the `menu` slot before it paints: `references/elements-overlays.md`.

### Check your work

{{conformanceChecklist}}

## What is not built

`references/known-gaps.md` lists what does not exist and what not to assume (the Guides are a first set of seven with no search yet, no reactive template layer, no reordering inside a layout builder container by drag, ).
