# Page / route context for nav, breadcrumbs and header (#670)

Status: design for the owner to confirm before steps 2 to 4 are built. Step 1 is merged (PR 746); this document records the requirements the issue was missing for the rest.

## 1. Problem

"Where is the reader?" is answered separately by each consumer. Under `mountApp` the answer is shared; everywhere else (a standalone page, the gallery and guides pages, every Blazor app) the side nav, the breadcrumb and the page header each guess from the URL or are told by hand, so they can disagree: the nav highlights one row, the crumbs say another, the header title a third. Data-driven menus (a record under a list, a tab that is not a route) cannot be expressed from the URL at all.

Requirements:

- R1. One value, `{ ids, section, current, crumbs, title }`, that nav, breadcrumb, page header and document title read, so they cannot disagree.
- R2. Zero config: the URL plus the route tree gives the default; an explicit override wins field by field.
- R3. Works without `mountApp` (standalone SDK pages) and in Blazor, without a second router.
- R4. No growth of the app entry graph (hard cap, section 6).
- R5. Elements keep working with attributes alone (no required context): the ownership rules in `core/STANDARDS.md` hold.

## 2. What exists today

- `core/js/router.js` (`mountRouter`): `current()` is `{ path, url, params, query, label, status }`, `crumbs()` comes from `buildCrumbs` (`core/js/route-tree.js`), `subscribe(fn)`. It knows the route tree, not the nav tree, and only `createPage` (`core/js/page.js`) turns its crumbs into a breadcrumb and title.
- `core/js/app/nav.js`: `locate(def, tree, path)` joins the module route tree and the nav tree (`navRoutes`) into `{ ids, crumbs }`; `pageContext(def, tree, path, override)` (step 1) returns `{ ids, section, current, crumbs, title }`, and a title alone also rewrites the last crumb; `routeContext(def, route)` reads a route node's `context` (object or `({ path, params, query }) => object`; an error is logged and the URL default stands); `markCurrent(rows, ids)` sets `current` and `expanded` on the rows. `core/js/app/app.js` (about line 111, `here`) feeds all of it on each navigation.
- `pk-side-nav` (`core/elements/side-nav/side-nav.js`): opt-in `current-path` plus `auto-expand-active`; `resolveActiveRoute(entries, path)` in `core/js/nav-logic.js` guesses the active leaf by matching the path against item hrefs. It has no notion of ids from a context.
- `pk-breadcrumb` (`core/elements/breadcrumb/`): items are slotted or declared by the host. `pk-page-header` (`core/components/page-header/page-header.meta.json`): a `crumbs` JSON attribute (`{label, href}`; the last is the current page and the title when there is no `heading`), `heading`, `homeHref`, `backLink`. Both are passive: they render what they are given.
- Hand-rolled copies: gallery and guides routing (#401), per-page hand-built crumbs in Blazor.
- Blazor: `PkSideNav`/`PkNavItem`, `PkBreadcrumb`, `PkPageHeader` are generated 1:1 wrappers (`blazor/mappings/side-nav.json`, `breadcrumb.json`, `page-header.json`) and use `NavigationManager`; there is no shared context. `PageBase` (#855, `docs/superpowers/specs/2026-10-08-page-toasts-design.md`) is the natural owner of page-level state; #1022 asks for lifecycle hooks on the same base.
- Related: #388 (the side nav is the active module's own tree; the module name for crumbs, title and drawer heading comes from the module picker's current value, so the first crumb is that title); #401 (hash routing duplicates `router.js`; an in-page anchor is deliberately not a route change); #855 and #1022 (page base).

## 3. Proposal: one context object, owned by the page

Shape (unchanged from step 1): `{ ids: string[], section: string|null, current: string|null, crumbs: {label, href?}[], title: string }`. Override: `{ ids?, crumbs?, title? }`, each optional.

Owner: the page owns it, derived, never stored by an element. Three owners, one shape, one pure function:

- Under `mountApp`: `app.js` already owns it (`pageContext` plus `routeContext`). Unchanged.
- Standalone SDK: a small module `core/js/page-context.js` exports `pageContext` (moved from `app/nav.js`, which re-exports it) and `createPageContext({ router, nav, override })` returning `{ get(), subscribe(fn), set(override) }`, driven by `router.subscribe`. `createPage` (`js/page.js`) can take it and wire crumbs and title. A lazy import for non-app pages.
- Blazor: `PkPageContext` (section 5).

How consumers read it (no new base-class hooks, per Ownership and reactivity):

- The host (the page or `mountApp`) writes plain attributes and children onto the elements, the existing contract: `pk-side-nav` rows get `current`/`expanded` via `markCurrent`; `pk-page-header` gets `crumbs` and `heading`; `pk-breadcrumb` its items. No element reads a global.
- To spare standalone pages the wiring, one helper `bindPageContext(ctx, { nav?, header?, breadcrumb? })` in `page-context.js` subscribes once and does those attribute writes, and returns the unsubscribe. `pk-side-nav[current-path]` stays as the zero-JS fallback and `resolveActiveRoute` stays its engine (the default `ids` source for a nav with no route tree).

## 4. Alternatives and trade-offs

| Option | For | Against |
| --- | --- | --- |
| A. Host-written (proposal): pure function plus a `bindPageContext` helper | Elements stay passive and attribute-driven; no ambient state; fits the ownership tests; zero entry cost | A standalone page needs one call to bind |
| B. Ambient: elements find a provider (DOM event or global) and read it themselves | Zero wiring | Elements gain subscriptions outside their subtree, hidden coupling, harder tests, awkward with the tier rules (C1/C4); Blazor needs a parallel mechanism |
| C. The context lives in the router (`router.context()`) | One place | The router has no nav tree; nav is module/app knowledge. Pulling it in costs size and couples them |
| D. Status quo plus docs | Free | The disagreement is the bug |

Recommendation: A. B is what step 2 of the issue first sketched ("ambient"); its cost is real and its benefit is one fewer call.

## 5. Blazor mapping

`PkPageContext` is a hand-written cascading value (listed in `blazor/handwritten.json`, within the thin-wrapper test): a record `PageContext(Ids, Section, Current, Crumbs, Title)`. A `PkPageContextProvider` component (parameters `Nav`, `Routes`, optional `Override`) computes it from `NavigationManager` with the same algorithm (see Q5 for interop versus a C# port). `PkSideNav` marks current and expanded rows from `Current`/`Ids`; `PkBreadcrumb` and `PkPageHeader` default `Crumbs`/`Heading` from it when their own parameter is unset; an explicit parameter always wins. No mapping JSON gains an attribute: these are Blazor-side defaults. `PageBase` (#855/#1022) exposes `PageContext` and `SetContext(override)` so a page that loads data can set the title once loaded, with cancellation and disposal handled by the #1022 lifecycle hooks.

## 6. Size and budget

The entry graph (`appEntryGzKb`, hard cap 22 KB, `core/site/scorecard/scoring.data.js`) has no room. Rules: nothing is added to `js/app/*` or `router.js`. Moving `pageContext`/`routeContext` from `app/nav.js` into `js/page-context.js` is size-neutral only if `app.js` imports it statically and the bytes stay equal, so the move happens only if `core/tests/app-budgets.test.mjs` shows no increase; otherwise `pageContext` stays in `nav.js` and the standalone module imports it from there lazily. `createPageContext`, `bindPageContext` and everything else new live outside the graph (lazy or standalone only). Element code does not change (attributes only), so element budgets are untouched. Any measured growth in the graph must be offset by an equal cut in it.

## 7. Non-goals

- No new element, no router replacement (#401 is separate), no change to Blazor's use of `NavigationManager`.
- No ambient or global state read by elements.
- No in-page anchors or tab state in the context (they are not routes).
- Not the module picker (#388), page toasts (#855) or the lifecycle hooks (#1022); this only plugs into them.

## 8. Migration

Additive. `mountApp` apps change nothing. Standalone pages keep `current-path` and `crumbs` attributes; the docs and the page-type skill workflow in `scripts/skills/` recommend `bindPageContext`. Gallery and guides adopt it as part of #401, not here. Blazor apps keep hand-written crumbs until they wrap in `PkPageContextProvider`.

## 9. Test plan

- Node: the existing `pageContext` cases, plus `createPageContext` with a fake router (subscribe order, per-field override precedence, title rewriting the last crumb, a throwing `context()` logged and ignored) and `bindPageContext` attribute writes on a fake DOM, with unsubscribe on destroy.
- Real-browser case (`core/tests/browser/`): the nav's current row, the header title and the document title agree across a navigation and after an override.
- Budget: `core/tests/app-budgets.test.mjs` unchanged and green.
- Blazor: bUnit for the provider and the `PkSideNav`/`PkBreadcrumb`/`PkPageHeader` defaults, including explicit-parameter-wins; a shared fixture proving C# and JS return the same context for the same inputs (if ported).
- Docs and skills: a gallery sample, the skill workflow text, a changelog fragment.

## 10. Steps (each leaves main releasable, about 400 hand-written lines or fewer)

2a standalone `page-context.js`, `bindPageContext` and tests; 2b docs and a gallery sample; 3 Blazor provider and defaults; 4 skills and docs.

## 11. Open questions for the owner

1. Ambient (elements read a provider) or host-written (`bindPageContext`)? Recommend host-written (option A).
2. Where does the pure function live, given the entry cap: moved to `js/page-context.js` only if bytes are neutral, else it stays in `app/nav.js`? Recommend trying the move and keeping it only if the budget test shows no growth.
3. Should the context's `title` also set `document.title` for standalone pages, with what suffix? Recommend yes via `createPage`, suffix from the app title, as `mountApp` does.
4. Override surface for modules: keep route-node `context` only, or also a `ctx.page.set(override)` call for data loaded after render (a record's name)? Recommend adding `set`, since the title is usually known only after load; lazy, not in the entry.
5. Blazor algorithm: JS interop over the single implementation, or a C# port with a shared fixture? Recommend the C# port with the fixture (no interop at render, works with server rendering); the matching logic is small.
6. Does the module-picker title (#388) become crumb 0 of the context, or a prefix the shell adds? Recommend the shell adds it, not the shared function, so standalone pages are unaffected.
7. Should `pk-side-nav` gain a `current-id` attribute in addition to `current-path`? Recommend no; `bindPageContext` sets `current` on rows, which the element already honours.
8. Fallback for `ids` when a standalone nav has no route tree: keep `resolveActiveRoute` href matching? Recommend yes, as the documented default.
9. Hash mode and in-page anchors (#401): confirm an anchor never changes the context. Recommend confirm.
10. Naming: `PkPageContext` and `bindPageContext`, or `PkPageState`? Recommend keeping "context" (matches step 1 and the issue).
