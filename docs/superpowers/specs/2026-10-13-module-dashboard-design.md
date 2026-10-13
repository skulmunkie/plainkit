# Composing a dashboard from modules: the redo from current main (refs #494, #346, #436)

Status: proposal for owner decision. Design only; no product code. It restates and decides the open points of `2026-09-28-dashboard-widget-contribution-design.md` (the "contribution
spec", PR #519, whose six questions were never answered) now that PR #502 is closed and the work is "redone from current main". Sections 1 to 4 of
`2026-09-28-dashboard-widgets-design.md` (pk-card state machine, tabs, filters, per-widget `load(key)`) stand and are already shipped in `pk-dashboard-page`; its section 5
("Module composition", the `dashboard`/`dashboardTabs` fields) is superseded.

## 1. Where main is today (evidence)

- `core/js/app/pages/dashboard.js` (17 lines) builds a `pk-dashboard-page` from a route's `config` (`tabs`, `widgets`, `sections`, `filters`, `load(key, ctx)`). A dashboard is
  therefore configured by the ROUTE; no module can add to it. The element already splits metadata (JSON `widgets`) from code (one `load(key)` callback) and isolates each
  widget in a `pk-card` with `loading | empty | error | ready` and Retry (#436).
- `core/js/app/config.js`: a `modules` entry is `{ id, title, icon, load, menu, can }`; unknown keys are warned and ignored. `id`, `title`, `icon` are author-written static
  data read BEFORE the module's code loads (`host.js` uses them for the menu, the busy cover and the allow-list). `entry.load` is called only for a module being visited.
- `core/js/app/host.js`: a single-flight `defs` map caches each loaded module definition; `loadWithRetry` + `within` give the 10 s timeout, one retry and cancellation; `access()`
  runs the app `can`, the entry `can` and the module `can` and fails closed. `ctx` members `signal`, `on`, `observe`, `after` end with the module/page (`scope()`).
  `host.js` is at its 6 KB gzip per-module budget.
- `core/js/app/module.js`: `defineModule` is pure validation; built-in page types are lazy chunks in `js/app/pages/` (`appPageTypeGzKb` = 3 KB gzip each, hard test in
  `core/tests/app-budgets.test.mjs`); `jsModuleGzKb` = 6 KB per file in `js/app/`. The static entry graph (`js/app.js` and its static imports) is a HARD CAP of 22 KB gzip (#514,
  #627); the last figure quoted on #502 was 21.84 KB, i.e. about 0.15 KB of headroom: ANY byte added to the entry graph must be offset or put in a lazy chunk.
- `core/js/app/nav.js` is the precedent: the menu is built from config metadata of every module, the deep nav tree only from the ACTIVE module's code.
- Real contributors that exist as modules today: `core/modules/{audit-dashboard,quality,performance,logs,scorecard,...}` and the site modules in `core/site/modules/`. Today the
  scorecard (#358) is a dashboard-shaped page owned by one module; nothing composes across modules. The demo app (`core/samples/app`) has `overview`, `orders`, `reports` (an
  existing `dashboard` icon) and is the natural showcase.
- Blazor has no `defineModule`/`mountApp` (the mountApp parity is a separate, deferred step); `pk-dashboard-page` is wrapped like every page element.

## 2. The problem and the requirements

Let a dashboard be assembled from what several modules offer, without the dashboard importing or knowing those modules, and without paying for modules the user does not look at.

Requirements (each is a test in section 11):

1. A module can add a widget (and, through the route, appear under a tab) with no edit to any dashboard route.
2. First paint loads no module code that is not needed for a visible widget (tenet SPEED, #346).
3. One widget failing (module import, loader throw, denied) never breaks the page or a sibling widget (RELIABILITY, #436).
4. Leaving the page cancels in-flight widget work and frees listeners; 100 mounts and unmounts hold flat resources.
5. Module ids still come only from the config allow-list; no runtime data chooses what is imported (SECURITY, #378).
6. No new always-loaded bytes beyond what the hard cap allows; no budget is raised.
7. A module remains "business logic plus configs for existing `pk-*`": a widget returns data for `pk-stat`/`pk-chart`, never markup.

## 3. Decision D6: the contribution model. Three alternatives

**A. Declarative field on the module code (`dashboard`/`dashboardTabs`, what #502 did).** The module's own definition lists its widgets. Simple to write and one place per module.
Reading the list requires loading every module, so the dashboard needs a host API (`ctx.modules()`) that eagerly imports the whole allow-list to draw one page. It also assumes ONE
implicit dashboard. Rejected by the owner on #502 for exactly these reasons.

**B. Static metadata in the app config entry, loaders in the module, a surface id as the contract (recommended).** A widget is a contribution of the module that owns the data. Its
static part (key, target surface ids `for`, tab, label, kind, size hint, `needs`, optional `can`, optional `order`) sits in the module's `modules[]` entry, next to `title`/`icon`;
its code part is `widgets: { key: { load } }` in the module, loaded only when the widget is visible. The dashboard (a route with a `surface` id) composes from metadata with a pure
function and never imports module code. Neither side owns the other; the surface id is the only coupling and points one way (widget to surface).

**C. A runtime registry / slot API (`ctx.dashboard.contribute(surface, widget)` called from a module's `mount`).** The most flexible: widgets can be computed, conditional and
unregistered. But `mount` only runs for the ACTIVE module, so a dashboard on another route either sees nothing or must mount every module to learn what it contributes (A's eager
problem again, plus mounting side effects), and it makes the widget list runtime data, which weakens the allow-list and linting story (a list that is not a static literal cannot be
checked by `core/tools/audit`). It is the right shape only for contributions that really depend on runtime state; those can be a later opt-in (open question 8).

| Criterion | A: field on module | B: metadata in config + loaders in module | C: runtime registry |
| --- | --- | --- | --- |
| First paint cost | all modules load | metadata only; modules of the visible tab | all modules mount |
| Coupling | dashboard reads module internals | dashboard reads strings (surface id, `module:key`) | dashboard reads a registry other code writes |
| Many dashboards / many surfaces | no (one implicit) | yes (`for: [...]`) | yes |
| Static analysis / lint | partial (inside code) | full (JSON-shaped literal in config) | none |
| Pure testability | needs module fakes | composer is a pure function; the loader lookup is separate | needs a registry harness |
| Allow-list security | every module code runs at compose | ids from config only | ids from config, list from runtime |
| New public API | `ctx.modules()` + 2 `defineModule` fields | 1 config field + 1 `defineModule` field (`widgets`) | `ctx.dashboard` + lifecycle rules |
| Blazor fit | none | metadata is plain JSON a Blazor host can supply | none |

Trade-off accepted in B: the config entry grows (one more place to edit when a module adds a widget), and drift between `contributes` and `widgets` is possible. Mitigation: drift is
reported per key when the module loads (a card in `error` naming the key, plus a dev warning), and `contributes` may live in a small sibling data file that the config imports
(`import { contributes } from './modules/sales.contributes.js'`), which keeps the entry short without loading module code. Recommendation: **B, with route curation (the contribution
spec's model C, `order`/`allow`/`deny`) delivered last and only when an app needs it.**

## 4. The contract (public surface)

App config (static, author-written, validated at `mountApp`; never fetched):

```js
modules: [
  { id: 'sales', title: 'Sales', icon: 'orders', load: () => import('./modules/sales.js'),
    contributes: [
      { key: 'churn', for: ['overview'], tab: 'sales', label: 'Churn', kind: 'stat', size: 'sm',
        order: 20, needs: ['range'], can: ctx => ctx.auth?.has('sales.read') ?? true, empty: { heading: 'No churn data' } },
    ] },
]
```

Module (lazy code):

```js
defineModule({ id: 'sales', widgets: {
  churn: { async load({ context, signal, ctx }) { const r = await fetch(url(context.range), { signal }); return { value: 3.1, tone: 'positive' }; } },
} });
```

Dashboard route (any module may own it; it has no knowledge of contributors):

```js
{ path: '/', page: 'dashboard', config: { surface: 'overview', heading: 'Overview',
    tabs: [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }],
    filters: [{ key: 'range', type: 'select', label: 'Date range', options: [] }] } }
```

Rules:

- **Identity** is `module:key`. A duplicate key inside one module, or a repeated surface in `for`, is a TypeError at author time (`mountApp`/`defineModule`, naming the module).
- **Tab labels** belong to the dashboard route. A contribution naming an undeclared tab gets an implicit tab titled from its id (one dev warning). A module cannot introduce a tab on its own
  (question 3).
- **Widget result** is `{ value, tone, ... }`/chart data for the declared `kind`; the dashboard page maps it to `pk-stat`/`pk-chart`. No markup, no DOM (strict-module rule).
- **`needs`** is a declaration check against the route's `filters[].key` at compose time: a missing key warns once, the widget still renders (question 4).
- **The dashboard composer never loads a loader, calls `can` with a route, or imports.** It is a pure function: `compose(entries, route, { allow })` returns `{ tabs, widgets }` (frozen
  metadata copies).

## 5. Lifecycle, lazy loading, cancellation, cleanup

1. `mountApp`: contribution metadata is already in memory (config). No module code loads for it.
2. The dashboard route mounts (`page: 'dashboard'` with `surface`): the page-type chunk imports `js/app/dashboard.js` (not part of the entry graph) and composes. Tab strip and the ACTIVE
   tab's card skeletons render at once, each skeleton with a reserved height by `kind` (CLS 0).
3. For each widget of the active tab, the page asks the host (an internal service on the page ctx, section 8) for the module's definition through the existing single-flight
   `defs`/`loadWithRetry` path, so two widgets of one module share one import, then calls `def.widgets[key].load(...)` with a per-widget `AbortController` whose parent is the page
   `ctx.signal`. Cards resolve independently; a slow one never delays another.
4. A tab opened later starts its widgets then ("lazy per tab"). A filter change re-runs only widgets already started, aborting their previous run first (stale responses are dropped by
   token, the existing `pk-dashboard-page` behaviour). In-tab viewport laziness (IntersectionObserver for cards below the fold) is a later optional step (question 6).
5. A widget's module is loaded as a DEFINITION only: its `mount`, `nav`, `state` and `footer` do not run, it does not become the active module and does not touch nav or breadcrumbs. A
   widget must therefore be self-contained (a fetch plus a mapping); it cannot rely on `mount` having run. The widget `ctx` is a subset like `mountPage`'s: `id`, `log`, `auth`, `settings`,
   `signal`, `href`, tracked `on`/`after`; `store`, `page`, `navigate`, `tasks`, `dialogs` are null (question 7).
6. Leaving the page (route change, module switch, host destroy) aborts every widget signal, drops late results (no DOM write after abort) and runs the page cleanup; the host's existing
   `scope()` ends everything tracked. A rejected loader after abort is not logged as an error.

## 6. Error boundaries, permissions and visibility

- **Per widget:** failure to import the module (after the host's retry), a missing `widgets[key]` (drift), a thrown or rejected loader, or a timeout puts only that widget's `pk-card` in
  `state="error"` with Retry (which re-runs `loadWithRetry` for that module and the loader once more). The generic failure text rules of `boundary.js` (`failureText`: no raw
  messages unless `userFacing` or debug logging) apply, so a backend message never reaches the card. All failures are logged through `createLogger('app:<module>')`.
- **Visibility, not errors:** a widget is HIDDEN, not errored, when the app `can`, the entry `can` or its own `can` (same signature, `{ auth, id, route }`) denies it; these are evaluated
  at compose time from config data (sync, no module code). The module's own `def.can` is only known after the import, so if it denies, that card is removed after load (one layout shift,
  documented; apps that care put the check in the entry `can`). A hidden widget's module is never imported. Client checks are UX only; the server enforces (existing tenet).
- A tab with no visible widgets is dropped; a dashboard with none shows the page's `empty` state.

## 7. Ordering, layout and persistence

- **Order:** `order: number` on a contribution (default 100, lower first); ties break by the module's position in the allow-list, then declaration order. The route's optional
  curation (`order: ['sales:churn', ...]`, `allow`/`deny` by `module:key`) is the last step and never adds a widget a module did not offer. Deterministic, so a screenshot is stable.
- **Layout:** the page already lays cards out on a grid (`part="grid"`). `size: 'sm' | 'md' | 'lg'` is a span hint mapped by CSS to token-based column spans, never a pixel value
  (no literal sizes; the element's own `--pk-dashboard-page-*` hooks). Phone: a single column. No new element.
- **Persistence:** (a) the active tab goes in the URL query (`?tab=sales`, via `ctx.navigate(..., { replace })`), so it survives reload, is shareable and back/forward behave; (b) filter
  selections go in the dashboard-owning module's `state` (`persist: ['range']`, the existing `store.module` spec, versioned); (c) a user-customised layout (hide, reorder) is out of scope
  now; when wanted it persists under one app-store key `dashboard:<surface>` as `module:key` lists, validated against the current contributions on read so a removed widget never
  breaks restore (question 5). Nothing reads layout from untrusted text.

## 8. How the page reaches modules without a public API or entry-graph growth

The contribution spec's rule stands: no public `ctx.modules()`/`ctx.contributions()`. `createModuleHost` already holds `allow` (entries with `contributes` after validation) and `defs`.
It exposes ONE small internal service to page factories, as a non-enumerable member of the page ctx (not in the documented ctx list, covered by `core/tests/element-surface.test.mjs`-style
guard in a new test): `{ entries(surface) -> frozen metadata list, def(id) -> Promise<definition> }`, where `def` reuses `run()`'s load path (allow-list check, `loadWithRetry`, `defineModule`
re-validation, id-equality check) so nothing new can reach `import()`. Cost target for the host change: at most about 0.1 KB gzip; everything else (composer, validation, dispatcher,
tab-scoped start) lives in `js/app/dashboard.js`, imported only by the dashboard page chunk. `config.js` only adds the key `contributes` to `known()` and an `Array.isArray` check; the deep
shape check runs in the composer and in a pure node test over the demo and site configs (fail at author time in CI even though runtime validation is lazy). If measured headroom
is insufficient, an equal cut elsewhere in the entry graph lands in the same PR (hard-cap rule); this is the main schedule risk (question 9).

## 9. Blazor and the other tiers

- Blazor stays a thin wrapper (#801). `pk-dashboard-page` is already mapped; this design adds no hand-written C# logic. Contributions are plain JSON-shaped data, so when
  `mountApp` parity arrives (its own step) the C# host supplies the same metadata and `OnLoad` callbacks and the generator/wrapper maps `surface`; no timers, retry loops or merge code
  in a hand-written component (the composer is JS in core). Nothing about this is deferred inside the first four PRs except documentation of the data shape.
- Composition tiers: the composer and page chunk are page-tier JS; contributions render only existing `pk-card`, `pk-stat`, `pk-chart` (no new element, tracker #336 untouched).
- Docs and skills: the guide "Build an app" (dashboard section), `scripts/skills/plainkit-sdk/SKILL.md` ("Build an app" workflow: how to add a widget from a module), the header of
  `js/app/config.js` and `js/app/module.js`, a gallery sample, the page-type audit data (`PAGE_TYPE.configKeys` gains `surface`), and one changelog fragment per user-visible PR.

## 10. Budgets

| Budget | Plan |
| --- | --- |
| Entry graph, hard cap 22 KB gzip | at most about 0.1 KB (host service, `contributes` key); offset elsewhere if the measured headroom is smaller; never raise |
| Page-type chunk, 3 KB gzip each | `pages/dashboard.js` stays a thin factory (about 0.3 KB more); the logic is in the lazy shared file |
| Per-file `js/app/` limit, 6 KB gzip | `js/app/dashboard.js` target 2.5 KB gzip; if it nears 3 KB split composer (pure) from dispatcher |
| Module chunk, 6 KB gzip | a contributing module adds a `widgets` map and loaders only; the demo modules stay inside it |
| Runtime | first paint loads zero widget modules beyond the active tab's; one import per module regardless of widget count |

## 11. Testing

- **Pure node tests** (`core/tests/`): composer (ordering, ties, duplicate key, bad shape, unknown surface, undeclared tab, `needs` warning, hidden by `can`, frozen output, a
  `__proto__`/`constructor` id or key never reaches a lookup), config validation of `contributes`, `defineModule` `widgets` validation, drift detection.
- **Host/page tests with fake modules** (no browser): single-flight (two widgets, one import), a rejecting import gives one error card, a throwing loader isolates, abort on route change
  cancels (a late resolve writes nothing), a denied module never imports, retry re-runs only that widget.
- **Browser cases** (`core/tests/browser/`, written before the CSS): 100x mount/unmount of the dashboard route holds listener, observer and timer counts flat (same harness as the
  app demo's leak case, #354); route-change CLS 0 with skeleton heights reserved; boundary case with one failing and one denied widget while the others render; widgets share a row
  at desktop 1280 and stack at phone 375 (rect comparison); the active tab survives reload via `?tab=`.
- **UI review:** a scenario `dashboard-modules` (tab switch, one error card with Retry, a collapsed phone layout, RTL) with every screenshot opened and checked, per AGENTS.md.
- **Scorecard/audit:** the module audit and size checks run on the new files; the demo module code stays within its line budget.

## 12. First PR and the ordered steps (each leaves main releasable)

Minimal first PR (about 250 lines, no runtime behaviour change): **contribution metadata, pure.** `config.js` accepts and normalises `contributes` (shallow), new
`core/js/app/dashboard.js` with the pure `compose(...)` and its shape validation, node tests for both, a validation test over the demo config, header docs. Nothing imports
`dashboard.js` at runtime yet, so the entry graph does not move and nothing in the demo changes.

1. **Metadata and composer (above).** Verify: targeted node tests, bootstrap, entry-graph measure unchanged.
2. **Host service and `defineModule` `widgets`.** The internal `{ entries, def }` service on the page ctx (reusing the load path), `widgets` validation in `defineModule`, tests with
   fake modules (single flight, allow-list, abort). Offsets the entry growth if needed.
3. **Dashboard page composes.** `pages/dashboard.js` accepts `surface`, composes, starts widgets per active tab with per-widget `AbortController`, isolates errors, drift detection;
   `contributes`-driven tabs. Targeted browser cases for boundary and cancellation. Skills text for the new fields.
4. **Demo, scenario and leak/CLS cases.** `core/samples/app`: `overview` and `reports` contribute to two surfaces, two dashboard routes, the network panel shows only the visible tab's
   modules loading; scenario `dashboard-modules` with screenshots; the 100x leak case and CLS case; guide and gallery sample; changelog fragment `added`.
5. **Persistence and `needs`.** `?tab=` and filter persistence, `needs` checks, per-module `can` removal behaviour, tests.
6. **Optional, each its own issue:** route curation (`order`/`allow`/`deny`); in-tab viewport laziness; Blazor `mountApp` parity step carries the metadata; the first real contributors
   (site modules `quality`, `performance`, `logs`, `audit-dashboard`) behind a site Overview dashboard, which exercises the model on the Gallery itself.

## 13. Rejected and not done

- A build-step manifest or reading `def.contributes` from loaded code (a second source of truth, or the eager-load problem).
- Fetching widget metadata from a server (targets and labels would become runtime data, against the allow-list tenet).
- A new `pk-widget` element (`pk-card` with its state machine is the widget chrome; decided in the widgets spec).
- Drag-and-drop layout editing, per-user widget catalogs, widgets that bring their own markup or CSS.

## 14. Open questions for the owner (with a recommendation each)

1. Confirm model B (config-entry metadata + module loaders + surface id) over A and C. Recommendation: B.
2. `contributes` inline on the config entry, or a top-level `contributions: [...]` list keyed `module:key`, or either (a sibling data file imported into the entry)? Recommendation:
   inline on the entry, with the sibling-file pattern documented for long lists.
3. May a module introduce a tab by itself, or do tabs belong to the dashboard route only? Recommendation: route-owned; an undeclared tab is an implicit one with a warning.
4. A `needs` key missing from the route's filters: warn and still render, or hide the widget? Recommendation: warn and render (the loader copes with `undefined`).
5. Should a user-customisable layout (hide/reorder) ever be in scope, and if so is per-user persistence in the app store acceptable? Recommendation: not now; keep the key
   `dashboard:<surface>` reserved and design it with the layout-builder work.
6. Viewport-lazy widgets inside a tab (IntersectionObserver) now or later? Recommendation: later (step 6); tab-level laziness covers the first-paint goal.
7. What does a widget receive: the read-only ctx subset in section 5, or the module's full ctx (which implies running `mount` and so the eager-mount problem)? Recommendation: the
   subset; a widget that needs module state reads it through the module's store facade only if question 7 is revisited.
8. Should a runtime registry (alternative C) ever exist for computed or conditional widgets? Recommendation: no, until an app has a case a `can` and `needs` cannot express.
9. May PR 2 offset a small amount of entry-graph code elsewhere (the cap leaves about 0.15 KB headroom) if the host service does not fit? Recommendation: yes, only as an equal-or-greater
   cut in the same PR, never a budget change.
10. Should `ctx.contributions(surface)` ever be public for custom dashboards? Recommendation: internal; the page type is the only consumer.
11. Should contributions later target surfaces other than dashboards (a home page, a record header)? Recommendation: keep `surface` generic in the data, name only dashboards in the docs.
12. Should the first real contributors be the Gallery's own site modules (dogfood, #346 tenet 7) or only the demo app? Recommendation: demo app in step 4, site modules as a separate
   follow-up issue once the model is merged.
