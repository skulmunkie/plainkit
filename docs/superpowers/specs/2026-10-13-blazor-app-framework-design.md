# Blazor app framework: PkApp, IPkModule, nav, guard, shared state, sample app (#364, #365, #366, #346)

Status: design for the owner to confirm before anything is built. Nothing here is implemented by this document. Line counts are estimates, to be measured in each step.

## 1. Where we are (re-verified on current main)

The SDK side of the tracker (#346, steps 1 to 17) is built: `mountApp`, `defineModule`, `moduleFromMount`, `mountPage`, hash routing, the store, 12 built-in page types (`core/js/app/**`), a demo app (`core/samples/app`, `orders.js` is 51 lines for a list, a record route under it, search and nav).

Blazor has the parts but not the frame:

| Exists | Where |
| --- | --- |
| Shared state: `IPkStore` (namespaced, `{v,data}`, validated, `Publish`), `IPkSettings`, `IPkTheme`, `IPkStorage` with memory fallback | `PkStore.cs`, `PkSharedState.cs`, registered by `AddPlainKit` (so #365 is done; it needs only a wiring check) |
| Page-type components, generated from mappings: `PkListPage<TItem>` (`Load`, `OnRowClick`, `OnSelect`, `OnBulk`, `Cells`, `Columns`), `PkRecordPage` (`Load`, `Save`), `PkDashboardPage`, `PkDocPage`, `PkMasterDetailPage`, `PkToolPage`, `PkSettingsPage`, `PkWizardPage`, `PkWorkspacePage`, `PkNotFoundPage`, `PkStatesPage`... | `blazor/mappings/*-page.json` (#1000 is largely answered: delegates and `OnRowClick` exist; typed field groups in a record page are the remaining gap) |
| Frame elements: `PkAppShell` (generated), `PkSideNav` (hand-written, tracks `NavigationManager`), `PkNavbar`, `PkCrumb`, `PkAppBarSearch` | `Components/` |
| Page state: `PageBase` (title, crumbs, busy, status, toasts), lifecycle design | `PageBase*.cs`, `2026-10-11-page-base-design.md` |
| Testing helpers | `Testing/Pk*Testing.cs` |

Missing, and the subject of this design: **no module concept, no app component, no nav derived from modules, no guard, no sample app, no one rule for how a Blazor app and a JS app share a module description.** `grep` finds no `PkApp`, `IPkModule`, `mountApp` or `defineModule` under `blazor/`.

Owner decisions already recorded on #346 that bind this design: Q2 a small shared **JSON manifest schema** for the data part of a module (ids, titles, icons, nav tree, route to page type) for JS and Blazor; Q3 route shape `<moduleId>/<module path>`; Q8 Blazor Server/SSR gets **contract-level parity, no lazy chunks**; Q6 budgets are ratcheted targets, existing budgets never raised.

## 2. Goals and non-goals

Goals

1. A Blazor developer writes a module (nav, routes, page-type pages, state) and registers it; `<PkApp />` gives the frame the SDK's `mountApp` gives (module picker, module side nav, breadcrumbs, search, theme, footer, 404, 403, loading and error boundaries).
2. The module contract is the SDK's, once. The data part is one manifest both sides read; behaviour (nav to crumbs, current item, guard rules, focus and announcement on route change) is core's and is not re-written in C#.
3. Blazor stays a thin 1:1 wrapper (#801): the hand-written C# is registration, DI, router glue and DTOs; every budget in `blazor/handwritten.baseline.json` is unchanged or lower; new files are listed with a category.
4. Tenets: speed (no framework work before first render, lazy assemblies where the platform allows), reliability (cancellation and cleanup from the Blazor router's own token, never a hand-written stale guard), security (module ids and routes from the registered allow-list only; guard is UX, authorization is the server's).

Non-goals

- A second router. Blazor's `Router` and `@page` stay the only routing; `PkApp` wraps it.
- Hosting a JS `mountApp` inside Blazor, or Razor inside a JS-owned page host (section 3 explains why).
- Sharing callbacks across the boundary. Only data is shared (the manifest), as the owner decided.
- Lazy loading on Server/SSR (Q8). Changing the SDK contract: a gap found here is a core change in its own PR first.
- New elements or page types (the Blazor page types exist; gaps go to #336/#1000).

## 3. The central decision: Blazor-native frame over the shared manifest

Two shapes were considered.

**A. Bridge `mountApp` (a `mount`-category marker plus `mountApp(host, config)`), config built from C#, callbacks proxied through `DotNetObjectReference`.** Rejected. It gives two routers (JS hash and Blazor), makes every `load`/`rowHref` a JS to .NET round trip (a network hop on Blazor Server, a sync-over-async trap on WebAssembly), and pages inside modules cannot be Razor: a Razor component cannot render into a JS-owned host without breaking "the host owns attributes and light-DOM children, the element owns its shadow tree" (`core/STANDARDS.md`). It also forces a hand-written adapter for every page type (#801 forbids).

**B. Blazor-native frame, shared manifest, shared pure logic.** `PkApp` is a Razor component composing the same elements `shell.js` composes (`pk-app-shell`, `pk-navbar`, `pk-side-nav`, `pk-app-bar-search`, toast/dialog hosts), wrapping Blazor's `Router`. Module pages are ordinary `@page` components using the existing page-type components. The contract is shared through (1) the manifest, (2) pure core logic ported with a fixture, and (3) the elements themselves. This is the shape of the precedent `PkPageContext` (#670: rules in core, C# port, one JSON fixture both test suites read) and of `PkSideNav` ("hook Blazor's own router, exchange attributes and events with the element").

Recommendation: B. The cost is one C# port of three small pure functions (below), guarded by a shared fixture so it cannot drift.

## 4. Declaring and registering a module (DI shape)

```csharp
// Program.cs
builder.Services.AddPlainKit();
builder.Services.AddPlainKitApp(app => app
    .Brand("Demo app")
    .Module<OverviewModule>()                       // order = module picker order = allow-list
    .Module<OrdersModule>()
    .Module<ReportsModule>(menu: PkModuleMenu.Settings)
    .Home("overview").Footer("Plainkit demo app"));

// Modules/OrdersModule.cs : one class, data only
public sealed class OrdersModule : IPkModule
{
    public PkModuleManifest Manifest => PkModuleManifest.FromJson(Resources.Orders);   // or built in C#; same DTO
    public ValueTask<bool> CanAsync(PkModuleContext ctx) => ValueTask.FromResult(ctx.User.IsInRole("orders"));
    public PkStoreSpec? State => new() { Defaults = { ["q"] = "" }, Persist = ["q"] };
}
```

- `IPkModule`: `Manifest` (the data part), optional `CanAsync(PkModuleContext)` (UX guard, default allow), optional `State` (a `PkStoreSpec`, opened as `ctx.Store`). It has no `Mount`/`Unmount`: a Razor component's own lifecycle (`PageBase`, `IAsyncDisposable`) is the Blazor form of those, and the SDK's tracked `on/observe/after/signal` is `PageBase.Lifecycle` + the router's `CancellationToken` (section 8).
- `PkModuleManifest` is the C# DTO of the manifest schema (`id`, `title`, `icon`, `nav` tree `{id,title,route|href,icon,badge,children}`, `routes: [{path,label,page,children}]`, `footer`). The DTO and its validator are **generated** from the schema (a new `core/js/app/manifest.schema.json`, the single source; the JS `defineModule` validation already enforces the same rules and is checked against the same fixtures). Callbacks (`load`, `rowHref`, `can`) are not in the manifest; in Blazor they are the page's own parameters.
- `AddPlainKitApp` registers a singleton `PkModuleCatalog` (the ordered allow-list: id to `IPkModule` and its assembly) and nothing else; ids are checked with the SDK's `MODULE_ID` pattern at startup and a duplicate or bad id throws at registration (a code mistake, like `IPkStore.OpenAsync`).
- Routes stay `@page "/orders/{Id}"` in the module's assembly or folder; the manifest `routes` list describes them for nav and crumbs. A **startup/bUnit guard test** reflects over `RouteAttribute` and fails when a manifest route has no `@page` or a `@page` under `/<moduleId>/` is missing from the manifest, so the two cannot drift (reliability).

## 5. How it maps onto core `defineModule`: generated vs hand-written

| SDK concept | Blazor form | Generated / core / hand-written |
| --- | --- | --- |
| `defineModule` data (id, title, nav, routes, footer) | `PkModuleManifest` DTO + `IPkModule.Manifest` | generated DTO from the schema; module author writes the data |
| `mountApp` frame | `PkApp.razor` | hand-written Razor markup, `router` category (the `PkSideNav` shape) |
| nav tree to current item and crumbs (`route-tree.js`, `nav.js`) | `PkNavModel` (current id, crumb list) | C# port of three pure functions, fixture `core/tests/fixtures/app-nav.json` read by node and .NET tests (the `PkPageContext` pattern), `runtime` category |
| route-change focus, live region, document title | one `routeChanged(title)` bridge call | core (a small export in the `app` bridge entry); hand-written call only |
| guard `can` at router and at mount | `PkRouteGuard` | hand-written glue over `AuthorizeRouteView`, `router` category |
| lazy chunk | `Router.OnNavigateAsync` + `LazyAssemblyLoader` (WASM) | hand-written glue, `router`; framework supplies the cancellation token |
| `ctx.store/settings/theme` | `IPkStore/IPkSettings/IPkTheme` | exist |
| `ctx.page` | `PageBase` | exists (budgets only shrink) |
| page types | `Pk*Page` components | exist, generated |
| error boundary | `PkModuleBoundary : ErrorBoundary` | hand-written, ~30 lines, `base` category |
| `moduleFromMount` | not needed: `PkDevTools`, `PkLogs`, `PkScorecard` etc. already are the Blazor form | none |

Estimate of new hand-written source (to be measured in each step, listed in `handwritten.json`, each file given a budget at its measured size, never raised):

| File | Lines |
| --- | ---: |
| `PkApp.razor` (frame, router wiring, nav/crumbs/search bindings) | 110 |
| `IPkModule.cs`, `PkModuleCatalog.cs`, `AddPlainKitApp` (registration, id check, builder) | 100 |
| `PkNavModel.cs` (port of current/crumbs, fixture-backed) | 90 |
| `PkRouteGuard.razor` (Can, 403/404 states, lazy-load hook) | 60 |
| `PkModuleBoundary.cs` (error state + retry) | 30 |
| generated `PkModuleManifest` etc. | 0 (generated, not counted) |
| Total | about 390 |

That fits one #801 review but is more than one 400-line PR once the sample and tests are added, hence the split in section 17. The total hand-written budget (`handwritten.baseline.json` sum 5,739 today) grows by exactly those measured budgets; nothing existing is raised. Open question O6 asks whether the owner wants a compensating cut elsewhere (candidates: `PageBase` and `PkRecordEditor` shrink in the page-base design).

## 6. Nav

- The module list (the allow-list order) is the module picker; the active module's `Manifest.Nav` is the side nav. `PkApp` renders `PkSideNav` with `PkNavItem`s from the tree (one loop in Razor; no behaviour). Current item and breadcrumbs (`App > Module > nav path > route labels`) come from `PkNavModel`, which takes `NavigationManager.Uri`, the catalog and the manifest. Dynamic labels (`label: p => ...`) are the page's own `PageBase.SetCrumbs`, as today.
- Phone: the same tree is the drawer, exactly as the SDK shell (the `pk-app-shell` element does this; `PkApp` sets nothing).
- `PkAppBarSearch` is bound to `IPkModule.SearchAsync(query)` (optional, default searches the nav), debounce stays the element's.
- A module without nav leaves the column empty (no reflow), the SDK rule, because the same element composition is used.

## 7. Routing and deep links

- Path routing (Blazor's) with `/<moduleId>/<module path>`; the SDK default is hash routing, which static hosting needs, but Blazor has real URLs, a base href and server-side rendering, so a hash would fight the router (O1). The manifest is module-relative in both worlds; the prefix is added by the app (SDK) or by the `@page` templates (Blazor, checked by the reflection test).
- Deep links are plain URLs: they load the module, run the guard, render the page. Query (`?q=`) is untrusted text (`textContent` only, no `MarkupString`).
- 404: a `PkNotFoundPage` in the frame for an unknown module or route (the router's `NotFound` template), links to home and the module nav. 403: `PkForbidden` state (the `forbidden` page type) with no module component rendered.
- Retired-URL rule (Q1: no stubs) does not apply: no Blazor URL changes.

## 8. Lifecycle, cleanup, cancellation

- Cancellation comes from the framework: `NavigationContext.CancellationToken` for lazy loading in `OnNavigateAsync`, and the page-base `Lifecycle` (`2026-10-11-page-base-design.md`) for page loads. No hand-written stale-load guard, timer or retry loop is added; `PkApp` has none. (The forbidden list in `scripts/tests/blazor-wrapper.test.mjs` is the test.)
- Cleanup: `PkApp` and `PkRouteGuard` subscribe to `NavigationManager.LocationChanged` and unsubscribe in `Dispose`, per the ownership rules; module `IPkStoreModule` subscriptions end with the scope; the elements' own `disconnected()` does the DOM side. A bUnit case mounts and disposes the app 100 times and counts `LocationChanged` handlers (reflection or a counting `NavigationManager`) and store subscriptions.
- Order safety: nothing may depend on element definition order (tracker rule). Each frame component renders with delayed element definition in bUnit (the same technique the `Pk*Page` tests use).

## 9. Error boundary and UX guard

- Boundary: `PkModuleBoundary` extends `ErrorBoundary`; `ErrorContent` shows the page-types' `states` error region (danger alert, Retry calls `Recover()`), logged through `IPkLog`. One around the module outlet so the frame and other modules survive, as in the SDK host. Loading boundary: the router's `Navigating` fragment shows the shared skeleton sized like the page type (no layout shift).
- Guard: `IPkModule.CanAsync` hides the module from picker and nav, and `PkRouteGuard` (over `AuthorizeRouteView`) renders 403 without instantiating the page; checked at navigation **and again** when the page renders (tenet: guard at router and at mount). Documented in the skill and the docs as **UX only**: `[Authorize]`, policies and API checks stay the source of truth; the sample shows one `[Authorize]` endpoint next to the module guard. No secrets in URLs or storage; ids only from the catalog.

## 10. Shared state across the JS and .NET boundary

- One persistence format: `IPkStore` already writes `pk.<module>` with `{v,data}`, the same envelope, validation and `legacy` migration as `core/js/store.js` (`PkStoreSpec` is documented as its C# form), through the bridge's `storageGet/storageSet`. So a Blazor app and an SDK page on one origin read the same keys, and the theme (`pk.app`) is shared. The store's source of truth in Blazor is .NET (scoped per circuit or per WASM app); JS elements get values as parameters, never read the store, and nothing is synced by polling.
- Theme: `IPkTheme.SetAsync` calls the core `setTheme` through the bridge (sets `data-theme`, persists); `?theme=` wins as in the SDK. A page that wants to react uses `IPkTheme.Changed` (event, no polling).
- Other modules' state: `IPkStore.Read(id)` (published keys only, read-only copy), as specified in #365; module A cannot reach module B's private keys.
- Prerender: no interop before the first render (the existing `PkStorage` memory fallback); verified by a prerender test in the sample host.
- A parity test: the SDK store fixtures (corrupt, old, foreign data) run in both suites where the format allows (an acceptance criterion of #365; check which cases the existing `PkStoreTests` already cover before adding).

## 11. Page types from Blazor

| Page type | Blazor today | What the app framework adds |
| --- | --- | --- |
| list | `PkListPage<TItem>` (`Load`, `OnRowClick`, `OnSelect`, `OnBulk`, `Columns`, `Cells`) | `RowHref` parity (#366): a manifest route plus `OnRowClick` calling `NavigationManager.NavigateTo`; no new parameter unless the SDK's `rowHref` can be generated (core callback with a string result); decide in O3 |
| record | `PkRecordPage` (`Load`, `Save`) and `PkRecordForm` + `PkRecordEditor` + `PkFieldGroup` | #1000 remainder: typed groups and sections in the main column. Not in this design's critical path; the sample uses `PkRecordPage` with JSON fields, as the SDK sample |
| master-detail | `PkMasterDetailPage` (`Config`, `RecordId`, `Fill`), selected record from the URL | the sample proves it: list route `/orders`, record route `/orders/{Id}`; `RecordId` is the `@page` parameter, the nav keeps the list entry current (`PkNavModel` crumbs) |
| dashboard | `PkDashboardPage` (`Load`) | none |
| doc | `PkDocPage` (`LoadItem`) | none |
| custom | any Razor component | the escape hatch is free: an `@page` component using any `Pk*` elements |

No page type is added or changed by the framework steps except what a measured gap demands (filed, not built here).

## 12. The sample app

`blazor/samples/PlainKit.AppSample` (new; or a route in `PlainKit.WasmPlayground`, O5): the same three modules as `core/samples/app` (Overview, Orders, Reports), the same data, same routes (`/orders`, `/orders/open`, `/orders/{id}`), search over orders, footer. Orders: `PkListPage<Order>` with `OnRowClick` navigating to the record, `PkRecordPage` with `Load`. Success criteria (recorded in the PR, as #366 asks): module code is about as short as the SDK one (config plus callbacks; `orders.js` is 51 lines, the target for `OrdersModule` + two `@page` files is at most 90 lines of C#/Razor, since Razor parameters are more verbose than object literals), no CSS/class/style, the manifest JSON byte-identical to the SDK sample's (a test asserts it), one `[Authorize]` demonstration, and prerender works. The sample is also the host for the browser cases in section 13.

## 13. Testing strategy

- **Node (fast, no browser):** the schema and fixture tests (`core/tests/fixtures/app-nav.json`, the manifest fixtures), `scripts/tests/blazor-wrapper.test.mjs` (new files categorised, budgets, no forbidden constructs), the generator tests for the generated DTO, `blazor-package.test.mjs` (component counts, mappings).
- **bUnit (`blazor/tests`):** `PkApp` renders the frame for a module list; nav and crumbs equal the fixture's expected values for each route; `PkRouteGuard` allow/deny/redirect; boundary shows error and Retry recovers; 100x mount/dispose leaves handler counts at zero; delayed element definition; manifest-to-`@page` reflection test; registration errors (bad/duplicate id). The lazy-assembly path is **not** testable in bUnit (no assembly loading): `PkRouteGuard` takes an `IPkModuleLoader` abstraction with a fake in bUnit and the real `LazyAssemblyLoader` implementation only in the sample.
- **Browser (the existing `core/tests/browser/` harness plus the sample, Playwright on the WASM sample):** real lazy load of a module assembly, deep link to a record route, 403 and 404, back/forward, focus lands on the page `h1` after a route change, no layout shift on module switch (CLS 0), and one UI-review pass (`scripts/ui-review.mjs` scenario `blazor-app-shell`, 4 desktop/phone x light/dark shots which are Read before merge, per the standing rule). Browser cases for Server are limited to prerender and reconnect; no lazy chunk case (Q8).
- **Parity cross-check:** the same scenario names as the SDK `app-shell` and `app-module-switch`, so a drift shows up as a diff of expectations.

## 14. Size and speed budgets

- Core: the `routeChanged` bridge export lives in the bridge entry, not the app entry; the SDK entry budget (`appEntryGzKb` hard cap) is not touched. If the export cannot fit in the existing bridge without raising a budget, it is a separate lazy chunk (the `svc-*` pattern).
- Package: `PlainKit.Blazor.dll` growth recorded per step (about 390 lines is on the order of a few KB of IL); the static web assets do not change except the bridge export. The `pack` check and `check-package.mjs` stay green.
- Speed: no timers or polling (forbidden by #801 anyway); nothing before first render but DI registration; WASM module assemblies lazy-loaded per module (only the home module in the first download), measured by the sample's published size per module; route change to a loaded module is a `LocationChanged` render, target within the SDK's 100 ms; Server: no lazy chunks, the budgets do not apply (O4).
- Every step records before/after (assembly bytes, sample publish size, route-change time, handler counts), per the tracker checklist.

## 15. Migration for existing Pk* page components

Nothing is renamed or removed. Existing `Pk*Page` components keep their parameters and work with or without `PkApp`. Consumers adopting `PkApp` move from `MainLayout` + hand-built nav to `PkApp` + modules in steps: (1) register modules, (2) replace the layout's nav by `<PkApp>`, (3) leave pages unchanged (their `@page` routes already match). The skill gets a "Blazor: build an app" recipe and a migration note ("a consumer's hand-rolled `AppFieldSpec`/shell shims, #264, retire"). `PkSideNav`, `PkAppBarSearch` and `PkAppShell` are reused unchanged; the `PkSideNav` hand-written file does not grow. Breaking changes: none. API: additive (minor), listed per step.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| C# port of nav logic drifts from core | shared fixture read by both suites; the port is three pure functions, ~90 lines |
| Manifest and `@page` routes drift | reflection test over `RouteAttribute` fails the build |
| Route prefix differs from SDK (path vs hash) | the manifest is module-relative; the prefix is the app's; documented (O1) |
| Hand-written budget creep | each file budgeted at measured size, listed with a category; owner may require a compensating cut (O6) |
| Lazy loading is untestable in bUnit | `IPkModuleLoader` seam, fake in bUnit, real in the browser case; the guarded logic is only "await the loader with the router's token" |
| Guard mistaken for security | docs, skill and the sample say UX-only; `[Authorize]` demonstrated |
| Server vs WASM behave differently (lazy loading, prerender, storage) | contract-level parity (Q8); prerender case; memory fallback exists |
| Page types need typed Blazor features the JSON config lacks (#1000, #264) | tracked there; the framework does not wait for them |

## 17. Ordered steps (each one PR, about 400 hand-written lines or fewer, `main` releasable after each)

1. **Manifest schema and shared fixtures in core.** `core/js/app/manifest.schema.json`, a `readManifest` validator reusing `defineModule`'s checks (no behaviour change), the nav/crumbs fixture `app-nav.json` with node tests, the generator emits `PkModuleManifest` DTOs. No Blazor behaviour yet; API additive.
2. **Registration and catalog.** `IPkModule`, `AddPlainKitApp`, `PkModuleCatalog`, id/duplicate checks, `PkNavModel` (the port, fixture-backed). bUnit and node tests. Docs stub in the skill. (#364 part 1)
3. **`PkApp` frame: nav, crumbs, search, theme, footer.** Razor over `PkAppShell`/`PkSideNav`/`PkNavbar`/`PkCrumb`/`PkAppBarSearch`, `routeChanged` bridge call (core), scenario `blazor-app-shell` with screenshots read. (#364 part 2)
4. **Guard, 404/403, boundary, lazy loading.** `PkRouteGuard`, `PkModuleBoundary`, `IPkModuleLoader` and the WASM implementation, 100x mount/dispose case, manifest-to-`@page` reflection test. (#364 part 3)
5. **Sample app on the same modules.** `PlainKit.AppSample` with Overview/Orders/Reports, list to record with `OnRowClick`, master-detail route, manifest byte-identical test, browser cases (deep link, 403, 404, lazy load, focus), recorded line counts. (#366)
6. **Shared state wiring check and parity fixtures.** Confirm `IPkStore/IPkSettings/IPkTheme` against the SDK store fixtures (corrupt/old/foreign), `IPkTheme.Changed`, prerender case, the module A/B isolation test; close the gaps found. (#365; may merge into step 2 if the check finds nothing)
7. **Skills, docs, gallery sample, changelog** ("Blazor: build an app" workflow in `scripts/skills/plainkit-blazor`, mapping and package tests, the #264/#1000 remainders linked), and a `blazor/handwritten.baseline.json` review (budgets lowered where the page-base design allows).

Steps 1 and 2 can overlap; 3 to 5 are sequential; 6 is independent after 2.

## 18. Open questions for the owner

**O1. Route mode on Blazor.** Tracker Q3 fixed the hash as the SDK default. Blazor has real URLs, base href, prerender and server-side `[Authorize]`. Recommendation: **path routing on Blazor** (`/<moduleId>/...`), with module-relative paths in the manifest so nothing else differs; hash would need a second router and breaks prerender and deep-link authorization. Confirm.

**O2. Callbacks across the boundary.** Recommendation: **never** (data-only manifest, per Q2; callbacks are Razor parameters), so no `DotNetObjectReference` proxies of `load`/`rowHref`. Confirm that the Blazor app is not required to run a JS `mountApp` config unchanged.

**O3. `RowHref` and `can` as manifest data.** The SDK's `rowHref(row)` is a callback. Recommendation: in Blazor, row navigation is `OnRowClick` + `NavigationManager` (no new parameter, no generated callback), and `can` is `IPkModule.CanAsync`; the manifest carries static `route` patterns only. If the owner wants a declarative `rowHref: '/{id}'` template in the manifest for both sides, say so; it would be core-first (a pure string template with a fixture) and shrink both samples.

**O4. Server/SSR scope (Q8 restated for this design).** Confirm: same contract, nav, guard and store; no lazy chunks; speed criteria N/A on Server; the lazy-loading browser case runs on WASM only.

**O5. Where the sample lives.** Recommendation: a new `blazor/samples/PlainKit.AppSample` (a standalone WASM app, publishable, the thing consumers copy), not a route inside `PlainKit.WasmPlayground`, so it does not inherit playground clutter and its published size is the meaningful number. The cost is one more project in `PlainKit.slnx` and CI build time.

**O6. Budget policy for the ~390 new hand-written lines.** The rule is budgets never rise; new files get their own. Recommendation: accept new files at their measured size, and in step 7 lower `PageBase`/`PkRecordEditor` per the page-base design as the offset, rather than blocking the framework on a prior cut. Or require the cut first (slower, safer). Owner's call.

**O7. Is `IPkModule` an interface or should a module be data only?** Recommendation: a thin interface (manifest + optional `CanAsync`/`State`/`SearchAsync`), not data-only, because Blazor needs a DI-resolvable place for the guard and state spec. A data-only JSON file alone (zero C#) is possible for a module without guard or state; support `AddPlainKitApp(a => a.ModuleJson("orders.json"))` as a later convenience if wanted.

**O8. Manifest ownership of nav.** Recommendation: the nav tree is in the manifest (single source with the SDK sample, enabling the byte-identical test) and **not** derived from `@page` attributes by reflection; the reflection test only verifies agreement. Derivation would hide the structure the SDK says nav must keep ("structure, never one per record").

**O9. Step 6 (shared state).** Because `IPkStore/IPkSettings/IPkTheme` already exist, recommendation: do not open a separate #365 PR; fold the parity-fixture check into step 2 and close #365 through it. Confirm.
