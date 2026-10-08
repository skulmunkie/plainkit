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

`modules` is the top of the menu **and the allow-list**: it is the only code the app ever imports, and each `load` is a lazy `import()`, so a module costs nothing until someone opens it. The config is checked when it is mounted: a bad value throws with the key named, an unknown key is one warning. The rest of the keys (`home`, `layout`, `search`, `theme`, `storage`, `auth`, `can`) are in the [app reference](../../dist/skills/plainkit-sdk/references/app.md).

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

Routes are relative to the module (the app adds `#/tour`), so the list above lives at `#/tour` and the overview at `#/tour/overview`. Each route names a page type and its config: `{ path, label, page, config }`. A `config` can also be a function of `{ params, query }` when the data depends on the address. A route may also carry `context`, the page's place when its address cannot say (a data-driven menu, a record under a section it is not nested in): `context: { ids: ['reports', 'monthly'], title: 'March report' }`, or a function of `{ path, params, query }` returning that object. `ids` are nav ids from the top section down to the current row (the side nav marks the row and opens the branches), `crumbs` is `[{ label, href? }]` with module-relative hrefs, and `title` names the page in the header and the document title (a title alone also renames the last crumb). Each part you leave out stays what the address says, so most routes need none. The last route, `{ path: '*', page: 'not-found' }`, answers every address that matches nothing.

## Page types

Pick the page type for the job before you write any markup. Each draws a finished page from one config object and, where it needs your data, one or two callbacks that receive `ctx` last.

| Family | Page type | Config (data) | Your callbacks |
|---|---|---|---|
| Data | `list` | `heading`, `breadcrumb`, `columns`, `filters`, `actions`, `empty`, `pageSize` | `load(query, ctx)` returns `{ rows, total }`; `rowHref(row)` |
| Data | `dashboard` | `widgets`, `tabs`, `sections`, `filters`, `empty` | `load(key, ctx)` returns what the widget shows |
| Data | `master-detail` | `list`, `backLabel`, `none`, `param` | `load(query, ctx)`, `rowHref(row)`, `listHref`, `mountDetail(pane, id, ctx)` |
| Forms | `record` | `fields`, `sidebar`, `heading`, `editable` | `load(id, ctx)`, `save(values, ctx)` |
| Forms | `settings` | `sections`, `values` | `save(values, ctx)` |
| Forms | `tool` | `heading`, `input`, `outcome`, `runLabel` | `run(values, ctx)` |
| Forms | `wizard` | `steps`, `review`, `submitLabel` | `validate(stepId, values, ctx)`, `submit(values, ctx)`, `load(ctx)` |
| Content | `doc` | `items`, `search`, `home` | `loadItem(id, ctx)`, `href(id, anchor, ctx)` |
| Content | `workspace` | `panes`, `labels`, `fill` | `mount(panes, ctx)` |
| Escape hatch | `custom` | none | `mount(host, ctx)` |
| States | `states`, `not-found` | `state`, `heading`, `description`, `label` | `retry(ctx)`, `action(ctx)` |

A validation callback or a save rejects, or returns, `{ errors: { field: message } }` to show inline errors. A `load` that rejects shows the built-in error state with Retry; you write neither. Reach for `custom` only when no other type fits: it is the counted escape hatch, and everything the framework tracks (listeners, timers, the abort signal) still applies to it through `ctx`.

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

The dashboard is configured explicitly: you list the widgets and write `load`.

### Form pages

A record page loads one record by the route's `id` (no `id` is a new record), tracks unsaved changes (leaving by a link, a breadcrumb or back/forward asks first through `ctx.dialogs.confirm`; closing the tab asks too; a Save that navigates itself is not asked), validates inline and saves. Report the outcome with `ctx.notify`, which is the app's one toast stack:

```text
const recordConfig = {
    heading: 'Order',
    fields: [{ name: 'customer', label: 'Customer', required: true }, { name: 'status', label: 'Status', type: 'select', options: ['Open', 'Shipped'] }, { name: 'total', label: 'Total', type: 'number' }],
    load: async id => ORDERS.find(o => o.id === id) ?? null,
    save: async (values, ctx) => { ctx.notify?.success('Order saved'); return values; },
};
```

A tool page is one input and one outcome; a settings page is sections of fields with a sticky Save and Discard bar; a wizard is one validated form per step:

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

`nav` is a function returning a few stable destinations, never one entry per record. Records are the rows of a list page and a record route under it. With `layout: 'side'` (the default) the modules are the top-level sections of the side nav and the active one holds its own nav; `layout: 'top'` puts a tiny app's module links in the header. On a narrow screen both use one drawer.

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

## Test a module

A module is plain data, so most of it needs no browser. `defineModule` and `readConfig` throw a `TypeError` that names the mistake, and `mountPage` with a page type and your config runs the real factory. The sample's own test loads every sample config, checks every module, mounts every route through its page type and calls each callback; copy its shape (`core/tests/app-samples.test.mjs` in the repository). For the states a still example cannot show (a menu open, a page scrolled, a phone width), the repository's review scenarios measure them in a real browser.

## Where to go next

- [Choosing what to build with](choosing-what-to-build-with.md) for the page types and elements to start from.
- The [app reference](../../dist/skills/plainkit-sdk/references/app.md) for every `ctx` member, the module header and the config header.
- [Logging](logging.md) for the `app:<id>` scopes a module's errors are logged under.
- Blazor has no app framework surface yet: a Blazor app keeps `PkAppShell`, `PageBase` and the router, and the [Blazor guide](getting-started-blazor.md) is where to start.
