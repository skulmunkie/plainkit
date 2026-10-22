---
title: Build an app
order: 4
summary: Mount one page or a whole app with the app framework. A config that is data, one module per part, a page type for every kind of page, a nav that is structure, state, guards, and the three tenets (speed, reliability, security) the framework keeps for you.
---

An app of several pages is mostly the same work each time: the header, the menu, the breadcrumbs, routing, loading and error states, the theme, focus and the page title. The app framework does that work once. You write a config, one module per part of the app, and for each page a **page type** with its data. You write no chrome, no CSS and no `style` attribute. Every snippet below is copied from the running sample [Demo app, page types](../../samples/app/pages.html) (`samples/app/`), and a test loads it through the real factories.

## A page or an app

- **One page, nothing around it:** `mountPage(container, page)` mounts a single page type. Use it for a page inside a site you already have.
- **An app:** `mountApp(container, config)` owns the whole frame and the routes. Use it when there are several pages, a menu and links between them.

`mountPage` takes a page type id, or `{ type, config }`, and resolves to a handle. `destroy()` removes the page and undoes every listener, observer and timer it registered:

```js
import { mountPage } from './plainkit/js/app.js';

const page = await mountPage(document.getElementById('app'), {
    type: 'not-found',
    config: { label: 'Go home', action: () => { location.hash = '#/'; } },
});
page.destroy();   // unmounts the page type and undoes anything its ctx.on/observe/after registered
```

## Mount an app

The whole entry of an app is a few lines. The config is data:

```text
import { mountApp } from '../../js/app.js';
import config from './pages.config.js';

mountApp(document.getElementById('app'), config);
```

```text
export default {
    brand: { text: 'Page types' },
    modules: [{ id: 'tour', title: 'Tour', icon: 'document', load: () => import('./modules/tour.js') }],
    footer: { text: 'Plainkit demo app, page types' },
};
```

`modules` is the top of the menu **and the allow-list**: it is the only code the app ever imports, and each `load` is a lazy `import()`, so a module costs nothing until someone opens it. The config is checked when it is mounted: a bad value throws with the key named, an unknown key is one warning. The rest of the keys (`home`, `search`, `theme`, `storage`, `auth`, `can`) are in the [app reference](https://skulmunkie.github.io/plainkit/skills/plainkit-sdk/references/app.md).

## Write a module

A module is one part of the app: an id, a title, a nav, its own routes and, when it needs them, `state` and `can`. `defineModule` checks it and returns it unchanged.

```text
export default defineModule({
    id: 'tour', title: 'Tour',
    state: { version: 1, defaults: { pageSize: 10 }, persist: ['pageSize'] },
    nav: () => [
        { id: 'orders', title: 'Orders', route: '/', icon: 'orders' },
        { id: 'overview', title: 'Overview', route: '/overview', icon: 'dashboard' },
```

Routes are relative to the module (the app adds `#/tour`), so the list above lives at `#/tour` and the overview at `#/tour/overview`. Each route names a page type and its config: `{ path, label, page, config }`. A `config` can also be a function of `{ params, query }` when the data depends on the address. A route may also carry `context`, the page's place when its address cannot say (a data-driven menu, a record under a section it is not nested in): `context: { ids: ['reports', 'monthly'], title: 'March report' }`, or a function of `{ path, params, query }` returning that object. `ids` are nav ids from the top section down to the current row (the side nav marks the row and opens the branches), `crumbs` is `[{ label, href? }]` with module-relative hrefs, and `title` names the page in the header and the document title (a title alone also renames the last crumb). Each part you leave out stays what the address says, so most routes need none. A route may be `persist: true`: its page is built once and kept, hidden, while another route of the module shows, and shown again (not rebuilt) when you return, so scroll position, typed text and a loaded list survive; it is freed when the module is left, and rebuilt when the same route returns with other params (so use it for routes whose page does not depend on the address, like a list). A kept page keeps its listeners and timers while hidden, so give it little background work. The last route, `{ path: '*', page: 'not-found' }`, answers every address that matches nothing.

## Page types

Pick the page type for the job before you write any markup. Each draws a finished page from one config object and, where it needs your data, one or two callbacks that receive `ctx` last.

| Family | Page type | Config (data) | Your callbacks |
|---|---|---|---|
| Data | `list` | `heading`, `breadcrumb`, `columns`, `filters`, `actions`, `empty`, `pageSize`, `selectable`, `rowKey`, `bulkActions` | `load(query, ctx)` returns `{ rows, total }`; `rowHref(row)`; `onSelect(detail, ctx)`; `onBulk({ action, selected, scope, query }, ctx)` |
| Data | `dashboard` | `widgets`, `tabs`, `sections`, `filters`, `empty` | `load(key, ctx)` returns what the widget shows |
| Data | `master-detail` | `list`, `backLabel`, `none`, `param` | `load(query, ctx)`, `rowHref(row)`, `listHref`, `mountDetail(pane, id, ctx)` |
| Forms | `record` | `fields`, `sidebar`, `heading`, `editable` | `load(id, ctx)`, `save(values, ctx)` |
| Forms | `settings` | `sections`, `values` | `save(values, ctx)` |
| Forms | `tool` | `heading`, `input`, `outcome`, `runLabel` | `run(values, ctx)` |
| Forms | `wizard` | `steps`, `review`, `submitLabel` | `validate(stepId, values, ctx)`, `submit(values, ctx)`, `load(ctx)` |
| Content | `doc` | `items`, `search`, `home` | `loadItem(id, ctx)`, `href(id, anchor, ctx)` |
| Content | `workspace` | `panes`, `labels`, `fill` | `mount(panes, ctx)` |
| Content | `note` | `heading`, `body`, `cardHeading` | none |
| Content | `print` | `heading`, `size`, `margin`, `toolbar` | `render(el, ctx)` |
| Escape hatch | `custom` | none | `mount(host, ctx)` (sample: the tour's `clock` route) |
| States | `states`, `not-found` | `state`, `heading`, `description`, `label` | `retry(ctx)`, `action(ctx)` |

The `list`, `dashboard`, `master-detail` and `settings` types also take the title bar keys of `pk-page-header`: `badges` (`[{ label, variant? }]`, beside the title), `actionsOverflow`, `overflowLabel`, `homeHref`, `homeLabel` and `homeIcon`; a `badges` slot on the page element adds your own chips.

A validation callback or a save rejects, or returns, `{ errors: { field: message } }` to show inline errors. A `load` that rejects shows the built-in error state with Retry; you write neither. The `list` and `record` types run `load`, `save`, `delete` and `onBulk` through the page lifecycle (`js/page-lifecycle.js`): a newer load aborts the older one, whose result is never drawn (your `load` gets an `AbortSignal` as its last argument, pass it to `fetch`), the page is busy while a save or delete runs, and everything in flight is aborted and silenced when the page is left. Write no `AbortController`, busy flag or disposed check of your own. Reach for `custom` only when no other type fits: it is the counted escape hatch, and everything the framework tracks (listeners, timers, the abort signal) still applies to it through `ctx`.

### Data pages

A list page hands you the query (`page`, `pageSize`, `sort`, `sortDir`, `search`, `filters`) and draws the table, the filters and the pager. `rowHref` makes a row open a record route and goes through the router, never the element:

```text
const listConfig = {
    heading: 'Orders',
    columns: [{ key: 'id', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status', sortable: true }, { key: 'total', label: 'Total', type: 'number', align: 'end' }],
    filters: [{ key: 'status', type: 'select', label: 'Status', options: ['Open', 'Shipped'] }],
    actions: [{ label: 'New order', href: '#/tour/orders/new', variant: 'primary' }],
    empty: { heading: 'No orders match', description: 'Try another filter.' },
    pageSize: 10,
    load: async query => {
        const rows = ORDERS.filter(o => (!query.filters?.status || o.status === query.filters.status) && `${o.id} ${o.customer}`.toLowerCase().includes((query.search ?? '').toLowerCase()));
        return { rows, total: rows.length };
    },
    rowHref: row => `/orders/${row.id}`,
};
```

A dashboard is a set of widgets that each load on their own, so one slow or failing widget never holds up another:

```text
        { path: '/overview', label: 'Overview', page: 'dashboard', config: {
            widgets: [{ key: 'open', label: 'Open orders', kind: 'stat' }, { key: 'revenue', label: 'Revenue', kind: 'stat' }],
            load: async key => ({ value: key === 'open' ? String(ORDERS.filter(o => o.status === 'Open').length) : `$${ORDERS.reduce((sum, o) => sum + o.total, 0)}` }),
        } },
```

The dashboard above is configured explicitly: you list the widgets and write `load`.

A dashboard can instead be assembled from what several modules offer, with no edit to the dashboard route when a module adds a widget. The route names a `surface`; each module says on its config entry what it contributes (static data, read without loading the module), and puts the code in a `widgets` map that loads only when the widget is shown:

```text
        { id: 'orders', title: 'Orders', icon: 'orders', load: () => import('./modules/orders.js'),
          // Widgets this module offers to the Overview dashboard: static data here, the code in the module's `widgets` (loaded only when the tab is shown).
          contributes: [
              { key: 'open', for: ['overview', 'orders'], tab: 'sales', label: 'Open orders', kind: 'stat', order: 10 },
              { key: 'revenue', for: ['overview', 'orders'], tab: 'sales', label: 'Revenue by month', kind: 'chart', order: 20 },
          ] },
```

```text
        { path: '/', page: 'dashboard', config: { surface: 'overview', heading: 'Overview', tabs: [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }] } },
```

```text
    widgets: {
        open: { load: async () => ({ value: String(ORDERS.filter(r => r.status === 'Open').length), subtext: 'waiting to ship', tone: 'neutral' }) },
        revenue: { load: async () => ({ kind: 'bar', data: { labels: ['Jul', 'Aug', 'Sep'], series: [{ name: 'Revenue', values: [410, 520, 511] }] } }) },
    },
```

A dashboard route can curate what modules contribute with `order`, `allow` and `deny`, lists of `module:key` ids. `order` puts those widgets first, in that order, and the rest follow; `allow` keeps only the listed widgets; `deny` removes the listed ones (it wins over `allow`). Curation never adds a widget a module did not offer, and a widget's `can` still applies after it. A well-formed id nothing offers for the surface warns once and is ignored; a list that is not an array of distinct `module:key` strings throws:

```text
        { path: '/summary', label: 'Summary', page: 'dashboard', config: { surface: 'orders', heading: 'Orders summary', tabs: [{ id: 'sales', label: 'Sales' }], order: ['orders:revenue'] } },
```

Only the tab on screen loads module code (a second widget of one module shares its import), a widget that fails shows its own error card with Retry beside the others, a contribution a `can` denies is never offered or imported, and leaving the page aborts every widget's `signal`. A widget's `ctx` is a subset (`id`, `log`, `auth`, `settings`, `signal`, `href`): the module is loaded as a definition only, so `mount` has not run. A `needs` key the route has no filter for warns once; a tab the route does not declare gets an implicit one. A contribution's `size` (`sm`, `md` or `lg`) is a column span hint: `md` takes two columns and `lg` the whole row from a tablet width up, and a phone has one column. The open tab is kept in the address (`?tab=`, written without a history entry, so a reload or a shared link opens on it). Filter selections are saved in the owning module's `state` when its `defaults` name the filter key (`state: { defaults: { range: '' }, persist: ['range'] }`). A module whose own `can` denies is only known once it has loaded, so its card is withdrawn then (one layout shift); put the check in the entry's `can` to hide it from the start.

### Form pages

A record page loads one record by the route's `id` (no `id` is a new record), tracks unsaved changes (leaving by a link, a breadcrumb or back/forward asks first through `ctx.dialogs.confirm`; closing the tab asks too; a Save that navigates itself is not asked), validates inline and saves. The outcome is toasted for you through `ctx.notify`, the app's one toast stack: "Saved" after `save`, "Could not save" (sticky, with the error text) when it rejects with anything but field errors, and, when you give a `delete(id, ctx)` callback, a Delete button that asks first and toasts "Deleted" or "Could not delete". A list page toasts "Done" or "Could not complete" after a bulk action. Word them with `toasts: { saved: 'Order saved', failed: err => err.message, deleted: false }` or switch them all off with `toasts: false`; a page that raised its own toast before should drop it (an identical title within 2 seconds is merged, a different one is a second toast):

```text
const recordConfig = {
    heading: 'Order',
    fields: [{ name: 'customer', label: 'Customer', required: true }, { name: 'status', label: 'Status', type: 'select', options: ['Open', 'Shipped'] }, { name: 'total', label: 'Total', type: 'number' }],
    load: async id => ORDERS.find(o => o.id === id) ?? null,
    save: async values => values, // the page type toasts "Saved" itself (config.toasts words or silences it)
};
```

A tool page is one input and one outcome; a settings page is sections of fields with a sticky Save and Discard bar (from three sections a section list sits beside the cards, a tab strip on a phone; `nav: false` turns it off); a wizard is one validated form per step:

```text
        { path: '/tool', label: 'Tool', page: 'tool', config: {
            heading: 'Tax calculator',
            input: [{ key: 'amount', type: 'number', label: 'Amount', required: true }],
            outcome: 'stat',
            runLabel: 'Add tax',
            run: async values => ({ value: (Number(values.amount) * 1.2).toFixed(2), label: 'With tax' }),
        } },
```

```text
        { path: '/wizard', label: 'Import', page: 'wizard', config: {
            steps: [
                { id: 'source', label: 'Source', fields: [{ name: 'url', label: 'File address', required: true }] },
                { id: 'options', label: 'Options', fields: [{ name: 'dedupe', label: 'Skip duplicates', type: 'select', options: ['Yes', 'No'] }] },
            ],
            review: true,
            validate: async (stepId, values) => (stepId === 'source' && !/^https?:/.test(values.url ?? '') ? { errors: { url: 'Use an http or https address.' } } : undefined),
            submit: async (values, ctx) => { ctx.notify?.success('Import started'); },
        } },
```

### Content pages and states

A master-detail page opens the record beside its list on one route (an inbox): declare the route and a child `/inbox/:id` with the same config, give `load` and `rowHref`, and draw the record in `mountDetail(pane, id, ctx)`; the sample's `inbox` route is a running example.

The `custom` escape hatch has a running example too: the sample's `clock` route draws its own DOM in `mount(host, ctx)` and returns a cleanup function.

A doc page shows an article with a table of contents; the route param `id` picks the item and the query `anchor` the heading. A workspace is panes (`nav`, `main`, `aside`) that your callback draws into; return a cleanup function or a `{ destroy() }` handle. A states page shows a loading, empty, error or forbidden state:

```text
const docConfig = {
    items: [{ id: 'start', title: 'Getting started', summary: 'Mount an app.' }],
    href: (id, anchor) => (anchor ? `/guide/${id}?anchor=${anchor}` : `/guide/${id}`),
    loadItem: async () => ({ title: 'Getting started', summary: 'Mount an app.', html: '<h2 id="mount">Mount</h2><p>Call mountApp with a config.</p>' }),
};
```

```text
        { path: '/workspace', label: 'Workspace', page: 'workspace', config: { panes: ['nav', 'aside'], mount: (panes, ctx) => { panes.main.textContent = `Main pane of ${ctx.id}`; } } },
        { path: '/empty', label: 'Empty', page: 'states', config: { state: 'empty', heading: 'Nothing here yet', description: 'Records you add appear here.' } },
```

Text you set from data goes in with `textContent` or as an element property, never as markup. The `html` of a doc item is sanitised by the page before it is shown; give it only content you trust or have sanitised.

A module may also carry its own `footer`, `{ text, links: [{ label, href }] }`, which replaces the app's `footer` while that module is active; `footer: false` draws none. A malformed footer is logged and the app footer stays.

## Routes and deep links

The default routing is hash routing (`#/<moduleId>/...`), which works on static hosting and needs no server rewrite; `routing: 'path'` with a `base` is the alternative. A record route goes in its list's `children`, so the list's menu entry stays current while a record is open and the breadcrumbs read the whole trail (Page types, Tour, Order 8). `label` is a string or `(params) => string`:

```text
        { path: '/', label: 'Orders', page: 'list', config: listConfig, children: [
            { path: '/orders/new', label: 'New order', page: 'record', config: { ...recordConfig, load: undefined }, can: ctx => ctx.auth?.has('orders.write') ?? true },
            { path: '/orders/:id', label: p => `Order ${p.id}`, page: 'record', config: recordConfig },
        ] },
```

Route params and query values come from the address, so they are untrusted text: put them in with `textContent`, and check a value before you use it to look something up. `ctx.navigate(path)` and `ctx.href(path, params, query)` build module-relative links; a link is never a string you concatenate from an address.

## The nav is structure

`nav` is a function returning a few stable destinations, never one entry per record. Records are the rows of a list page and a record route under it. The side nav is the active module's own nav and nothing else (a module without a `nav` leaves the column empty on a wide screen, so the page does not reflow, and shows no drawer body on a phone). Modules are switched with the module picker: a button in the header showing the active module's title, and on a narrow screen the first row of the one drawer. With one module there is no picker.

## State, settings and guards

- **State.** `state: { version, defaults, persist }` gives the module a private store, `ctx.store` (`get`, `set`, `patch`, `subscribe`, `reset`). Only the `persist` keys are written, under a versioned envelope; corrupt, oversized, wrong-type or newer data falls back to the defaults with one logged warning. Keep secrets out: it is plain `localStorage`.
- **Settings.** Use the `settings` page type for a form of preferences, and `ctx.theme` for the theme.
- **Guards.** A `can` on a module or a route (`can(ctx)`) or on the app (`can(entry, { auth, id, route })`) returns `true`, or `{ allow: false, redirect }`. Anything else, or a throw, denies (it fails closed): the user sees the forbidden state.

**A client guard is a user-interface rule only.** It hides what a user should not be offered and stops a click that would fail; it never keeps data safe, because anyone can open the developer tools and change the script. Enforce every permission on the server, and treat `ctx.auth` as what the server told the page, not as proof.

## What the framework keeps for you

Three tenets apply to every page and module. The framework builds them in; your part is to keep them true.

1. **Speed.** The entry contains no module and no page type: each is a lazy chunk, fetched when its route is first used and warmed when the pointer reaches its link. The shell reserves its space before the elements are defined, so a route change does not shift the layout. There is no polling: use `ctx.after` for a timer, never `setInterval`. A module that loads a large library should load it inside its own route.
2. **Reliability.** Every step that can fail (loading a module, a page type, your callbacks) sits inside a boundary that shows a loading state, then an error with Retry, then a forbidden or not-found state, and logs the cause through the SDK logger. Listeners, observers, timers and the abort signal come from `ctx` (`ctx.on`, `ctx.observe`, `ctx.after`, `ctx.signal`), so leaving a page returns everything to the count before it mounted: register nothing on `window` or `document` by hand. Nothing may depend on the order elements load in.
3. **Security.** The app runs under a strict content security policy (`script-src 'self'; style-src 'self'`): no inline script, `style` attribute, `<style>` element, inline handler, `eval` or cross-origin request, in the config or in a callback. Module ids and routes come from the config allow-list only; a route, a hash or a stored value is untrusted; a client guard is a user-interface rule and the server decides.

## What is in the entry and what is lazy

The **entry** is `js/app.js` and everything it imports statically: the module contract and host, the shell, the router, the nav, the config reader, the boundary, the store and the theme code. Every app pays for it before anything is drawn, and it is 20 files, 21.68 KB gzip (comments removed). Everything else is a lazy chunk fetched on first use:

- **Page types.** Each `js/app/pages/<type>.js` chunk is fetched when a route first names its page type; the largest is 0.99 KB gzip (limit 3). The notification, task, dialog and leave-guard services load the same way, the first time a module calls them.
- **Modules.** A module costs nothing until someone opens it, because the config holds only `load: () => import('./modules/orders.js')`. To add a module, add one entry to `modules` with a static `import()` literal and put the module's code, and any large library it needs, in that file; the entry does not grow. Do not import a module statically from the entry or from the config file's own top level.

The cap is enforced by `core/tests/app-budgets.test.mjs`. It walks the static `import` and `export ... from` graph from `js/app.js` (a dynamic `import()` is not followed), strips comments, joins the files and gzips them. The limit, `appEntryGzKb` (22 KB), is a **hard cap**, not a budget that ratchets down: it was set once by the owner at the measured size and is never raised. New code that must join the entry graph has to be offset in the same change by an equal or larger cut elsewhere in it, usually by moving something to load on first use, the way the services above do. When the test fails, the answer is never a bigger number.

## Test a module

A module is plain data, so most of it needs no browser. `defineModule` and `readConfig` throw a `TypeError` that names the mistake, and `mountPage` with a page type and your config runs the real factory. The sample's own test loads every sample config, checks every module, mounts every route through its page type and calls each callback; copy its shape (`core/tests/app-samples.test.mjs` in the repository). For the states a still example cannot show (a menu open, a page scrolled, a phone width), the repository's review scenarios measure them in a real browser.

## Where to go next

- [Choosing what to build with](choosing-what-to-build-with.md) for the page types and elements to start from.
- The [app reference](https://skulmunkie.github.io/plainkit/skills/plainkit-sdk/references/app.md) for every `ctx` member, the module header and the config header.
- [Logging](logging.md) for the `app:<id>` scopes a module's errors are logged under.
- In Blazor: [Build an app in Blazor](blazor-build-an-app.md).
