# Dashboard widget contribution: who owns whom (refs #494, #436, #346)

Status: proposal for owner decision. Design only; no product code. Supersedes section 5 ("Module composition") of `2026-09-28-dashboard-widgets-design.md`
(sections 1 to 4, the pk-card state machine, tabs, filters and tab loading, stand unchanged).

## The problem

PR #502 (held) composes a dashboard by giving `defineModule` two fields, `dashboardTabs` and `dashboard`, and by adding a host API `ctx.modules()` that loads
EVERY allow-listed module so their widget lists can be merged. The owner objected: it adds a public page-ctx API, it forces eager loading of every module just to draw
one page (against the lazy-module tenet of #346), and it never says which object owns the other. That question, stated plainly:

- Does a **dashboard own its widgets** (a dashboard lists what it shows)?
- Or do **widgets belong to dashboards** (a module says where its widget goes)?
- Can two dashboards show different widgets? Can one widget appear on several dashboards?

The owner's framing: dashboards provide the context in which module widgets can attach, and the interaction must be clean.

## What the code already does (evidence)

- The `mountApp` config `modules: [{ id, title, icon, load: () => import(...) }]` is the allow-list. `id`, `title` and `icon` are **static metadata that exist before
  the module's code loads** (`host.js` uses `entry.title` for the busy cover and the menu; `entry.load` is called only for the module being visited, after the id
  passed `MODULE_ID` and the allow-list check). Per-module metadata in the config entry is therefore an established pattern, and it is trusted because the app author wrote it.
- `nav.js` is **not** an eager merge. The menu shows every module from config metadata, but a module's own `nav` tree is read only for the ACTIVE (loaded) module
  (`menuTree(..., active, shown)`). Nav is lazy because a menu needs one level of every module (title, icon: in config) and the deep level only for the current one. A
  dashboard needs a slice of EVERY module at once. So #502's "parallel to nav.js" holds for the merge and warning style, not for the loading.
- `pk-dashboard-page` already separates a pure-JSON `config.widgets` from one `load(key)` callback bound to the page, with `this.context` for filters: a
  metadata/code split at the element level, which is exactly what a contribution model needs at module level.

## Candidate models

**A. Dashboard owns widgets via a field on the module (`dashboard`/`dashboardTabs`, what #502 does).** A module says "I have widgets for the dashboard"; the
dashboard merges every module's list. There is one implicit dashboard, so "which dashboard" cannot be asked; a second needs a variant like `dashboard: { ops: [...] }`.
The widget list is in module CODE, so reading it means loading every module (`ctx.modules()`).

**B. Widget targets dashboards through a contribution registry (recommended).** Neither owns the other. A dashboard is a surface with an id; a widget is a
contribution owned by the module that has the data and names target surface ids. The static part (label, kind, targets, context keys) is declared in the module's
app-config entry (`contributes`), the code part (`load`) in the module and loaded only when the widget is visible.

**C. Hybrid: B plus per-dashboard curation.** B, and the dashboard route config may also reorder, allow or deny contributions by `module:key`. Curation is
ordering and filtering only; it never adds a widget the module did not offer.

**D (rejected up front): the dashboard lists widgets by `module:key` only.** Solves laziness and multi-dashboard, but every new widget needs an edit in the dashboard
config and a module cannot say "I belong to `ops`". It is C's curation without the contribution, so C subsumes it.

| Criterion | A: `dashboard` field (#502) | B: contribution registry | C: B + curation |
| --- | --- | --- | --- |
| Laziness | poor: all modules load to draw tabs | good: tiny metadata eager, code per visible tab | same as B |
| Coupling | dashboard depends on module internals (code) | module names a surface id (a string); dashboard knows only metadata | as B; curation refers to `module:key` strings |
| Many-to-many | no (one implicit dashboard) or needs a variant field | yes: `for: ['overview', 'ops']`, one direction (widget to ids) | yes |
| Testability | needs real module loads or fakes of `ctx.modules()` | pure function: metadata in, config out; loader lookup separate | as B, curation also pure |
| Security | allow-listed ids, but every module's code runs at compose time | metadata is app-author config; module ids still only from the allow-list; no runtime data picks a target | as B; curation is app-author config |
| Public API surface | new `ctx.modules()`, two `defineModule` fields | one config field (`contributes`), one `defineModule` field (`widgets`), optional read-only accessor | B plus `order`/`allow`/`deny` on a route |
| Fit with nav's precedent | copies nav's field shape, not its laziness | copies nav's split: config metadata first, module code later | as B |
| Blazor parity | none (no `defineModule` in Blazor) | metadata is plain JSON a Blazor host can supply; loaders stay C# | as B |

## Recommendation

Model C, delivered in two steps (B first; curation when a real app needs it). The evidence **confirms** the orchestrator's direction and sharpens two points.
First, "where does metadata live before the code loads" already has an answer in the codebase: the module's entry in the `mountApp` config, next to `title` and
`icon`. A generated manifest is rejected below. Second, `ctx.contributions(surface)` need not be a **public** ctx API in the first cut; the dashboard page type
receives the list from the host internally, which removes the specific objection to #502. A public read-only accessor is an owner question.

### Ownership, stated

- **Dashboard** (a route of page type `dashboard` with a `surface` id): owns layout, tabs, filters, `this.context`, ordering and allow/deny. It never imports module code.
- **Module**: owns the data and the widget's `load`, and says where the widget may appear (`for`).
- **Neither** owns the other; the surface id is the contract, referenced in ONE direction (widget to surface ids). A module can gain or drop a widget without touching
  any dashboard, and one widget can serve several surfaces.

## Public API sketch

App config (metadata: eager, author-written, static literal like `load`):

```js
modules: [
  { id: 'sales', title: 'Sales', icon: 'orders', load: () => import('./modules/sales.js'),
    contributes: [
      { key: 'churn', for: ['overview', 'ops'], tab: 'sales', label: 'Churn', kind: 'stat',
        size: 'sm',                      // hint only: 'sm' | 'md' | 'lg'
        needs: ['range'],                // context keys the loader reads (optional)
        empty: { heading: 'No churn data' } },
    ] },
]
```

Module (code, lazy):

```js
defineModule({
  id: 'sales',
  widgets: {                              // key -> loader; keys must match contributes[].key
    churn: { load: async function () { const { range } = this.context; return { value: 3.1, tone: 'positive' }; } },
  },
});
```

`this` is the page element, as in the approved spec, so `this.context` carries the filter selections. A `defineWidget(key, { load })` identity helper for editor typing is
possible but adds no behaviour and is not required.

Dashboard route (curation, optional, step 2):

```js
{ path: '/dashboard', page: 'dashboard', surface: 'overview',
  tabs: [{ id: 'sales', label: 'Sales' }],       // tab labels: the route owns them
  order: ['sales:churn', 'orders:open'],         // listed first, in this order; the rest follow in allow-list order
  deny: ['reports:draft'],                       // or allow: [...]; entries are 'moduleId:key'
  filters: [{ key: 'range', type: 'select', label: 'Date range', options: [] }] }
```

Accessor: the host hands `contributions(surface)` to the dashboard page chunk internally. It returns a frozen plain list of metadata copies
`[{ module, key, tab, label, kind, size, needs, empty }]`, never a loader or module code. It is a pure filter over config, so it loads nothing and cannot fail on a
module. If exposed publicly later it stays exactly this.

### Rules

- **Tab labels** belong to the dashboard (route `tabs`). A contribution naming an undeclared tab gets an implicit tab titled from its id, with a dev warning logged once.
  This replaces #502's "first module to declare owns the label", which made the label depend on load order.
- **Context keys.** `needs` is checked against the route's `filters[].key` when the dashboard is composed: a missing key logs a warning naming module, widget and key, and
  the widget still renders (its loader gets `undefined` and must cope). Widgets without `needs` are unaffected. This is a declaration check, never a runtime guard on values.
- **Unknown target.** A contribution `for` an id no dashboard route uses is ignored in production and reported once by dev checks (typo catcher).
- **Duplicate key.** Identity is `module:key`. The same `key` in two modules is fine; a duplicate `key` within one module, or a surface repeated in `for`, throws at
  `mountApp` validation naming the module (fail at author time).
- **Bad shape** (missing label, non-string ids, oversize list) throws a TypeError naming the module at `createModuleHost`, like a bad entry today; `MAX_*`-style warnings copy nav's.
- **Error isolation per widget.** Lookup is `await entry.load()` then `def.widgets[key]?.load`. A module that fails to load, whose `widgets` lacks the key, or whose loader
  throws puts only that widget's pk-card in `state="error"` with Retry (Retry goes through the existing `loadWithRetry`). A module denied by its `can` hook at the door
  shows its widgets as absent, not as errors. Nothing breaks the page or another widget (#436).

## Lifecycle and loading

1. `mountApp`: contribution metadata is read from the config already in memory. No module code loads for it; the cost is bytes of config.
2. The dashboard route mounts: compose `{ tabs, widgets }` from the metadata (pure) and render the tab strip and, for the ACTIVE tab only, card skeletons in `loading`.
3. When a tab becomes active (initial tab on mount, later tabs on first visit), for each of its widgets ensure the owning module is loaded (the host's single-flight
   loader, so two widgets of one module share one import) and call the loader with `this` bound to the page. Cards resolve independently.
4. A filter change re-runs the loaders of widgets that have loaded at least once (section 4 of the approved spec); never a tab never opened.
5. A module loaded for a widget is the same cached instance the shell loads on navigation; it does not become the active module and does not touch nav or breadcrumbs.

A dashboard with three tabs over `sales`, `orders` and `reports` loads only the modules of the visible tab on first paint.

## What changes in PR #502

Keep: `pk-dashboard-page` unchanged; `dashboard.js`'s merge into `{tabs, widgets}`, its single `load(key)` dispatcher (unknown key rejects into an error card), shape
validation and its tests (adapted); the demo (reworked); the skills text and Blazor note (reworded).

Remove or rework:

- `ctx.modules()` and the eager loop: remove. The dispatcher becomes async per key: resolve module, then loader.
- `dashboard`/`dashboardTabs` `defineModule` fields: replace by `contributes` (config entry) plus `widgets` (module).
- "First module owns the tab label": replace with route-owned `tabs`.
- Some validation moves from `defineModule` to `createModuleHost`, where the metadata now lives.

Suggested small PRs (each about 200 lines, each leaves main releasable):

1. `createModuleHost`: validate and expose `contributes`; pure `contributionsFor(surface)`; tests. No page change.
2. `defineModule` `widgets` validation; dispatcher in `dashboard.js` (module-load-then-loader, per-widget isolation, tab-scoped lazy start); adapt #502's tests.
3. The dashboard page chunk composes from `surface`; context-key and unknown-target checks; demo with two surfaces; skills text; Blazor note.
4. Curation (`order`/`allow`/`deny`) when an app needs it.

## Size and budget

Metadata validation and the pure composer are small (target: under 1 KB gzip added overall). The framework entry is being split separately, so the composer lives in
the dashboard page-type chunk (loaded only by apps with a dashboard), not the always-loaded host. `host.js` sits at its 6 KB gzip budget, so it gets at most the
metadata validation, moved to another file if needed. No budget is raised.

## Demo

`core/samples/app`: `overview` and `reports` declare `contributes` for surface `overview`; `reports` also for `ops`. Two dashboard routes show the same widget on two
surfaces and different ones per surface; the network panel shows only the modules of the visible tab loading.

## Strict-module mode

Under the strict rules (`2026-09-28-site-v2-strict-modules-design.md`) a widget is data plus a loader returning configs for existing `pk-*` elements (`stat`, `chart`),
never markup or DOM. `contributes` is JSON-shaped and static, so it can be linted.

## Rejected alternatives for the metadata location

- **Build-step manifest generated from module code:** needs a build (apps are import-map/no-build first) and adds a second source of truth that can drift.
- **`def.contributes` returned by the module:** reading it means loading the module, the #502 problem again.
- **Metadata fetched from a server:** target ids and labels would become runtime data, contradicting the allow-list security tenet.

Drift between config and module (a `contributes` key with no `widgets` entry, or the reverse) is warned per key when the module loads and shows an error card, never a silent gap.

## Open questions for the owner

1. Public or internal: should `ctx.contributions(surface)` exist for app authors (custom dashboards), or stay internal? Recommendation: internal for now.
2. Is `contributes` on the config entry acceptable given large configs grow? The alternative, a top-level `contributions: [...]` list keyed `module:key`, keeps module
   entries short at the cost of another place to edit.
3. Route-owned tab labels: acceptable that a module can no longer introduce a tab by itself?
4. Should `needs` violations warn (proposed) or hide the widget?
5. Curation now, or drop `order/allow/deny` until an app needs it?
6. Should contributions later target surfaces other than dashboards (a home page, a record header)? The model allows it (`surface` is generic); the first cut names only dashboards.
