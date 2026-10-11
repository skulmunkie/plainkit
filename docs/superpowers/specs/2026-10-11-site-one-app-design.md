# The site as one mountApp app (#346, #355, #388, #401, #670)

Status: proposal for the owner. Read-only research; no code changed. Date 2026-10-11, base `origin/integration-0.13`.

## 1. Current state

- **One app shell exists.** `core/app.html` + `core/app.js` call `mountApp(el, config)` with `core/site/app.config.js` (#1068). Modules there: `devtools` and `settings` are real lazy modules (`core/site/modules/`); `gallery`, `files`, `scorecard`, `theme`, `layout-builder` and `guides` are throwaway entries that load `modules/redirect.js`, which navigates to the old multi-page site (`site/<x>/index.html`). The config still says `layout: 'top'`, `search: false`, `home: 'devtools'`.
- **The old site shell** `core/site/shell.js` still draws a second navbar (`PAGES` list) on every old page, with its own theme key (`pk-site-theme`, read once through `storage.legacy`).
- **Gallery** (`core/site/gallery/`: gallery.js 65 baselined audit findings, gallery-views.js 31, preview.js 17) is a standalone page with its own router, `gx-shell` frame, nav, search, theme and settings. **Guides** (`core/site/guides/`: page.js, guides-logic.js, guides-search.js body-word index, `content/`) is likewise standalone. The composition spec (`2026-10-11-gallery-composition-paydown.md`) says 39 of the Gallery findings are `document.`/`location.` access that only mountApp ownership removes (its Q1).
- **Framework** (`core/js/app/`): `app.js` (mountApp), `config.js` (readConfig; `layout` is 'side'|'top'), `host.js` (routes, `persist: true` routes, lazy import behind the allow-list), `module.js` (defineModule; route `context`), `nav.js` (`navOf`, `absolute`, `menuTree` merging the module list into the nav tree, `paintNav`, `paintLinks`, `pageContext`, `routeContext`), `shell.js`, `lazy.js`, `boundary.js`. `core/js/page-context.js` (#670) reuses `pageContext`/`routeContext` for pages outside mountApp and is not in the app entry.
- **Chrome parts**: `core/shells/app-shell`, `pk-side-nav`, `pk-nav-item`, the settings menu popover.
- **Budget**: `appEntryGzKb` limit 22 (hard cap, #514), measured 21.78, so 0.22 KB of room. Anything that adds code to the entry graph must be offset in the same PR. Module chunks (Gallery, Guides) are not in the entry graph when loaded lazily; `appPageTypeGzKb` (3) applies per page-type chunk.
- **Tests**: `core/tests/retired-urls.test.mjs` lists retired addresses (`settings/index.html`, `devtools/index.html`, `site/settings/page.js`, `site/devtools/page.js`) and fails if any tracked file refers to them (owner decision: no redirect stubs). Browser cases live in `core/tests/browser/cases-app.js` and `cases-app-shell.js`.

## 2. Target

The whole site is `app.html`, one `mountApp` app, `routing: 'hash'`, routes `#/<module>/...`.

1. **Modules**: `gallery`, `guides`, `files`, `scorecard`, `theme`, `layout-builder`, `settings`, `devtools`, all lazy (`load: () => import(...)`), nothing from them in the entry graph.
2. **#388 shell**: no `layout` key. The side nav is the active module's own tree. A module picker (button with the active module's title, opening the settings-menu popover shape) replaces the module list and the `top` layout; on a phone it is the drawer's first item; absent with one module. Breadcrumb, document title and drawer heading read the picker's value.
3. **Gallery module**: its element/pattern/sample tree is the module `nav` (a function of `ctx`, built from `gallery.data.js`, few at the top level; records are never nav entries; the 12/40 warning applies). Its views are routes (`/elements/:name`, `/samples/:id`, `/foundations/:id`...). Sample hosts that are costly to rebuild use `persist: true`. Gallery's own theme control moves to the app (settings menu); viewport and inspect controls become the Gallery page's own toolbar (`pk-toolbar`), per the composition spec.
4. **Guides module**: nav = the guide groups; routes `/` (index with search) and `/:slug` (label = guide title, `context` for crumbs). Body search stays pure (`guides-search.js`).
5. **Header search from module search**: `search: { placeholder, minLength }` turned on; the active module's `search(query, ctx)` supplies results (Gallery: `filterLeaves`/`filterTree` from `js/gallery-options.js`; Guides: `searchGuides`), else nav titles. Each module's search code lives in its own chunk.
6. **Page context** (#670): the module route `context` field feeds crumbs, title and the current row. `page-context.js` stays for non-app consumers; the app host already uses the same pure functions.
7. **Old multi-page entries are deleted**, not redirected (owner's no-stub rule).

## 3. Step plan (each about 400 lines hand-written, each leaves integration releasable)

| # | Step | Content | Browser cases | Entry-graph budget |
| --- | --- | --- | --- | --- |
| 1 | **#388 picker and single-tree nav** | Remove `layout`; `menuTree` merge goes; picker in the bar (desktop) and drawer-first (phone); hidden for one module; title, crumb and drawer heading from one value. Settings, Dev tools and redirect modules keep working. | #388 acceptance: one picker showing the active title; choosing repaints the nav to that module's own tree; phone drawer first item; one-module no picker; empty-nav module; no drift between the three title readers; 100 mount/destroy and 100 switch cycles leak nothing | Net zero or negative: deleting `paintLinks`, the merge and the `top` path must pay for the picker. Gate: measured <= 21.78 |
| 2 | **Search wiring** | Turn on `search` in `app.config.js`; app-level fallback to nav titles; document the `search(query, ctx)` contract. | search opens; results from a module's `search`; falls back to nav; absent with `search:false`; phone search button | Zero (already in the graph; any growth offset in step 1) |
| 3 | **Guides module** | `site/modules/guides.js`: nav from guide groups, index and `/:slug` routes, `searchGuides` as module search, content loaded lazily per guide; drop the `guides` redirect entry and `site/guides/index.html` + page.js shell; add retired addresses. | index lists guides; open a guide; header search finds a body word; crumbs `App > Guides > <title>`; back/forward; deep link `#/guides/<slug>` | Zero (lazy chunk; `app-budgets.test.mjs` shows it absent from the entry graph) |
| 4 | **Gallery frame as module** | `site/modules/gallery.js`: nav = the existing tree, one route `/*` mounting the current gallery view code unchanged inside the app body (old gallery routes mapped to hash paths). Gallery's own `gx-shell`, bar, theme and nav are dropped; theme, title and routing owned by the app. Redirect entry removed. Largest risk; may split 4a (nav + route mapping) and 4b (views mount). | every gallery section reachable by hash; deep link per element; current row follows route; phone drawer; theme switch reaches sample frames; first-load no-layout-shift case (#135/#1076) re-pointed at `app.html` | Zero (lazy chunk) |
| 5 | **Gallery views as routes** | Split the view dispatch into module routes (`persist: true` for sample hosts), per-route `context` crumbs; Gallery search via module `search`; remove `gallery.js` routing and the S7 findings it held. Interleaves with the composition paydown. | viewport switch; inspector; sample iframe persists across nav; element search; tokens/spacing pages | Zero |
| 6 | **Remaining tools as modules** | `files`, `scorecard`, `theme`, `layout-builder`, each replacing its redirect entry (one PR each if over 400 lines; scorecard is the largest). | one smoke case each (opens, key control works, deep link) | Zero |
| 7 | **Retire the old site** | Delete `site/shell.js`, per-page `index.html`s, the redirect module, the `pk-site-theme` legacy read (one release later); `home` becomes `gallery`; docs and `scripts/skills/` describe `app.html#/<module>`; `retired-urls.test.mjs` list complete. | none new; link check covers every old path | Zero or negative |

Steps 1 and 2 are framework (strict budget gate); 3 is the pilot for the content-module pattern (smaller than Gallery); 4 to 6 follow in any order after 3; 7 last. One PR open at a time. Each step adds a changelog fragment and, where it changes looks, a `ui-review` scenario (picker open, phone drawer with picker, Gallery inspector docked).

## 4. What breaks

- **Old URLs**: `site/gallery/index.html?...`, `site/guides/...`, `site/files`, `site/scorecard`, `site/theme`, `site/layout-builder` and their hash/query forms stop working. No redirect stubs (owner rule). `site/gallery/embed.html` and `preview.html` are iframe documents used by samples and must stay standalone documents, or the sample frames break.
- `core/tests/retired-urls.test.mjs`: add each retired address in the step that removes it, after fixing every reference (docs, README, skills, scripts, scorecard, gallery link maps).
- Stored state: `pk-site-theme` (read once via `storage.legacy`), gallery settings keys (`gallery/settings.js`); nav open/closed state resets.
- `scorecard-sweep`, `ui-review.mjs` and any script opening gallery pages by URL need the new addresses.
- Removing the `layout` config key is a public API change: API-surface note and a `breaking` or `changed` fragment.
- Blazor and package assets that link to `site/...` pages.

## 5. Risks

- **Entry-graph cap** (0.22 KB room): the picker (step 1) is the only entry addition, offset by deleting top-layout code. If it does not fit, load the picker popover in a lazily imported chunk at first interaction (the bar still renders the button).
- **Gallery coupling**: gallery.js owns routing, theme, frame, inspector and nav in one file; step 4 may exceed 400 lines. Split: nav + route mapping first.
- **First-load layout shift**: the #135/#1076 work lives in gallery CSS; the move must keep a case measuring the nav column from first paint.
- **Persisted routes and memory**: `persist: true` on sample hosts holds iframes; cover with the leak cases.
- **Guides search** needs the word index at load; keep it in the module chunk, not the entry.
- **Concurrent work**: the composition paydown rewrites the same Gallery files; sequence against it (one PR at a time).

## 6. Open questions for the owner

1. **Old URLs: accept the break or keep forwarders?** Recommend: accept the break at 0.13 (consistent with the no-stub decision), list it as `breaking`, keep `embed.html` and `preview.html` as standalone documents.
2. **Order: #388 first, or the Guides pilot first?** Recommend #388 first: the picker is needed as soon as there are more than a few modules, and the budget gate is easiest to hold before modules arrive.
3. **Gallery as one `/*` route first, or all views as routes at once?** Recommend two steps (4 then 5): frame and nav with unchanged view code, then real routes.
4. **Home module after the move**: `gallery` or keep `devtools`? Recommend `gallery`.
5. **Picker shape**: reuse the settings-menu popover as #388 decided; if it cannot be reused unchanged, stop and file against #336 rather than build an element. Recommend confirming this applies here too.
6. **Gallery theme and viewport controls**: theme goes to the app's settings menu only (one theme owner); viewport and inspect stay a Gallery toolbar. Recommend yes.
7. **Do `files`, `scorecard`, `theme`, `layout-builder` belong in the public site app, or under `devtools`?** Recommend keep them as top modules for now (8 in the picker, under the 12 advice), revisit if the picker feels crowded.
8. **Sequencing against the composition paydown**: before, after or interleaved with steps 4 and 5? Recommend after step 4 (the app owns the frame first, so the `pk-app-shell` rewrite of `gx-shell` is not done twice) and interleaved with step 5.
