# Page types audit: a shared base, and the options for "constructs" (audit and options)

Status: research only, for the owner to choose from. No product code is changed by this document.
Verified against `main` at 1ab4c214 (queue 49), not against issue text. Sizes are measured from the tree (raw bytes; gzip at level 9, per file, so
per-file gzip over-states a combined bundle by a few percent). Anything marked "estimate" is not measured.

Owner ask: "audit our page types, and probably simplify them into constructs instead of components, so they all inherit and extend from a base. but let's look at the options first".

## 1. Headline findings

1. **The base the owner is asking for mostly exists already, but only 8 of 13 page types stand on it.** `pk-page-shell` (component, 1,201 B gz) draws the
   title bar (`pk-page-header`), the whole-page state region and the content area; `js/page-shell.js` (`showTitleBar`, `showState`, `showTabs`, `mountTitled`,
   `titleBarKeys`), `js/page-states.js`, `js/page-lifecycle.js` (`createLifecycle`) and `js/page-fields.js` are the shared helpers (design:
   `2026-10-11-page-base-design.md`). `pk-page-shell` is used by dashboard, list, master-detail, record, settings, tool, wizard, workspace. Not used: doc, note, not-found, print, states.
2. **The two layers are already uniform; the middle is not.** The 13 factories in `core/js/app/pages/*.js` (25.4 KB raw in total) all do the same thing:
   create `<pk-X-page>`, copy a subset of `config` into `el.config` (five of them also via `titleBarKeys`), bind callbacks with `ctx` appended, `mountTitled`. Nine
   of the 13 are 1.0 to 1.7 KB of this one recipe. The element layer (107.8 KB raw, about 37.5 KB gz) repeats a second recipe that the base design never reached.
3. **Real divergence is in behaviour, not markup.** Stale-result guarding is hand-rolled six different ways (section 3). `createLifecycle`, written for
   exactly this (#1022), is used by only two *factories* (list, record) and by **no element**. `pk-tool-page.runNow()` has no stale or destroyed guard at all.
4. **65% of the bytes are five types whose logic is not shareable** (doc 20.8 KB, record 19.0, dashboard 12.7, wizard 12.1, settings 11.2 of 107.8 KB raw). A base
   can remove duplicated scaffolding (estimate 3 to 5 KB raw in elements, 8 to 10 KB raw in factories) but cannot shrink those. Any option sold as a big size win is not honest.
5. **Naming and API drift is the cheapest thing to fix and the most visible to consumers**: `title` vs `heading`, `load(id)` vs `load(query)` vs `load()` vs
   `loadItem(id)`, event prefixes (`pk-action` vs `pk-record-*` vs `pk-wizard-*`), `fill` on only two types (section 3).
6. **Near-duplicates exist**: `pk-states-page` and `pk-not-found-page` are one thing (an `empty` state with defaults), and both re-implement what `pk-page-shell` already does with its `state`/`stateHeading`/`stateDescription` props and `pk-page-shell-retry` event. `pk-master-detail-page` and `pk-workspace-page` share an identical mount/unmount/generation block.

## 2. Inventory

Sizes: element = `.js + .css + .html` raw bytes (gz in brackets); factory = `core/js/app/pages/<id>.js` raw (gz); lines are the element `.js`/`.css` files.
All 13 are `tier: page` with a `pageType` naming one factory (`core/tests/tiers.test.mjs`; `tiers.baseline.json` has zero entries, so C1/C4 are clean today).

| Page element | Factory (`pageType`) | Element raw (gz) | Factory raw (gz) | js / css lines | Shell | Props | Slots | Events | Data in | Static slotted mode | Tests: unit / browser files / scenarios |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `pk-dashboard-page` | `dashboard` (+ lazy `dashboard-modules` chunk when `surface`) | 12,694 (4,192) | 1,888 (931) | 192 / 22 | pk-page-shell | config, context | badges | pk-action | `load(key)` per widget, token per widget | no | 17 tests / 4 / 5 |
| `pk-doc-page` | `doc` | 20,779 (6,792) | 2,901 (1,325) | 265 / 49 | none (own shell part) | config | nav, bar, aside, default | pk-navigate | `loadItem(id)`, `searchItems`, `href` | **yes** (#1829) | 17 / 5 / 3 |
| `pk-list-page` | `list` | 7,540 (2,841) | 3,093 (1,331) | 91 / 9 | pk-page-shell around pk-data-table | clickable, rowHrefTemplate, navigate, config | badges, actions, toolbar, before-list, `cell-*` | pk-select, pk-row-click, pk-bulk | `load(query)` via table | no | 14 / 7 / 12 |
| `pk-master-detail-page` | `master-detail` | 6,607 (2,447) | 1,985 (915) | 79 / 19 | pk-page-shell around pk-list-page | config, recordId, fill | badges, list, detail | pk-action | `load(query)`, `mountDetail(pane,id)` | **yes** (#1829) | 7 / 5 / 3 |
| `pk-not-found-page` | `not-found` | 2,093 (1,048) | 1,390 (730) | 26 / 2 | none | heading, description, label | title, drawn | pk-action (no detail) | none | no (config only) | 7 / 0 / 0 |
| `pk-note-page` | `note` | 2,206 (947) | 1,221 (662) | 40 / 5 | none | config | none | none | none | no (config only; builds its own h1 + pk-card) | 5 / 0 / 1 |
| `pk-print-page` | `print` | 3,498 (1,426) | 1,577 (822) | 37 / 12 | none (toolbar + sheet) | size, margin | toolbar, title, default | none | none | effectively yes (default slot) | 3 / 1 / 2 |
| `pk-record-page` | `record` | 19,037 (5,947) | 4,168 (1,822) | 233 / 6 | pk-page-shell | config, mode, deletable, cancellable, sticky, wrapTitle, busy, error, dirty | badges, main-before, main-after, side-after | pk-action, pk-record-dirty/cancel/change/save/delete | `load(id)`, `save`, `beforeSave`, `delete` | no | 25 / 5 / 5 |
| `pk-settings-page` | `settings` | 11,229 (3,943) | 1,412 (719) | 156 / 10 | pk-page-shell | config, values | badges | pk-action | `values` in, `save(values)` | no | 16 / 3 / 5 |
| `pk-states-page` | `states` | 1,588 (859) | 1,737 (900) | 15 / 2 | none | state, heading, description, label | title, default, drawn | pk-retry | none | effectively yes (default slot shown when ready) | 7 / 0 / 0 |
| `pk-tool-page` | `tool` | 4,860 (1,853) | 1,422 (740) | 84 / 5 | pk-page-shell | config, runLabel | default (replaces form, #1604), title, badges, actions | pk-action | `run(values)` | partial (default slot) | 8 / 1 / 1 |
| `pk-wizard-page` | `wizard` | 12,114 (3,778) | 1,576 (777) | 182 / 10 | pk-page-shell + pk-stepper + pk-card | config, dirty | badges, `step-<id>` | pk-action, pk-wizard-dirty, pk-wizard-submit | `load()`, `validate(id,values)`, `submit(values)`, `mountStep` | partial (`step-<id>` slots) | 9 / 1 / 1 |
| `pk-workspace-page` | `workspace` | 3,594 (1,410) | 1,068 (604) | 53 / 8 | pk-page-shell around pk-workspace | config, fill | badges, default, nav, aside | pk-action | `mount(panes)` | effectively yes (panes are slots; `mount` optional) | 5 / 2 / 1 |
| **Total** | | **107,839 (37,483)** | **25,438 (about 12,200)** | | | | | | | | |

Plus the shared layer: `js/page-shell.js` 8,480 B (3,196 gz), `page-states.js` 3,179 (1,369), `page-lifecycle.js` 3,476 (1,456), `page-fields.js` 3,306 (1,320), `components/page-shell` 1,201 gz, `components/page-header` 5,304 gz.
Factory service chunks: `svc-mount-page`, `svc-leave-guard`, `svc-page-toasts`, `svc-search`, `svc-widgets`, `dashboard-{compose,curate,modules,state}` (lazy, outside the app entry graph).
Shells (`core/shells`): `pk-app-shell` (4.1 KB js, 5.4 KB css) and `pk-app-frame` (6.0 KB js) are hosts, not page types; they own landmarks and the viewport (tiers spec). `custom` is a 14-line factory for hand-built pages.

Pages in the packages: `packages.json` has no page entry, so all 13 ship in the core package (relevant to #1656 and the packed-size ceiling).
Gallery and skill coverage was not enumerated per type here (the gallery is generated; the only hand-written skill mention of a page element found is `scripts/skills/plainkit-blazor/SKILL.md`): treat it as an open check for the build-out PRs.

### Blazor

All 13 page wrappers are generated from `blazor/mappings/*-page.json` (about 42 KB of mappings: record 12.4 KB, list 9.5, wizard 4.0, rest 0.6 to 2.5). They are 1:1 and obey rule 16.
Hand-written page-adjacent files are not wrappers: `PageBase*.cs`, `PkComponentBase.Load.cs`, `PkRecordEditor*.cs`, `PkListPageQuery.cs`, `PkPageContext.cs`, `PkDashboardSurface.cs`, `PkModuleDashboard.razor` and the `Testing/Pk*PageTesting.cs` helpers, each with a budget in `blazor/handwritten.baseline.json`. The only debt entry there is `layout-recipe` in `PkDevToolsPage.razor`. The Blazor lifecycle is a hand port of `createLifecycle`, tied by `core/tests/fixtures/page-lifecycle.json`.

## 3. Duplication and divergence: "same concern, N implementations"

| Concern | Implementations found | Where | Notes |
|---|---|---|---|
| Stale / superseded load guard | **6**: `$gen` counter in record (`fetch`, `submit`), wizard (`fetch`, step run), master-detail (`start`), workspace (`start`); `$currentId` compare in doc; `$tokens[key]` per widget in dashboard; none in tool (`runNow`); `createLifecycle` in two *factories* | record-page.js:70/206, wizard-page.js:39/144, master-detail-page.js, workspace-page.js, doc-page.js:165, dashboard-page.js:159 | `createLifecycle` (3.5 KB) already has abort + generation + destroy; no element uses it. master-detail and workspace `start/stop/focus` blocks are the same ~25 lines. |
| Mount handle destroyed on disconnect | 2 identical (`$stop`, `stop()`), 1 variant (record/wizard bump `$gen`) | master-detail, workspace | the framework handle contract `fn | {destroy}` is repeated verbatim |
| Whole-page state region | `pk-page-shell` state props (8 types go through `showState` into a box part), own `drawn` light-DOM slot (states, not-found), own `$body` (doc), per-card (dashboard) | page-shell.js, states-page.js, not-found-page.js | states and not-found re-implement the shell's state region because of rule 3 and the loader (see their header comment); that constraint is real but is solved once in `showState`'s caller, not per type |
| Title bar (breadcrumb, actions, badges, heading) | 8 via `showTitleBar`; note builds its own `pk-heading` h1; states/not-found accept a `title` slot; doc builds its own `$title`/crumbs; print none | page-shell.js | record's page title is `config.title` because `config.heading` already means the field-list heading; every other type uses `heading` |
| Title-bar config copy in factories | 5 factories spread `titleBarKeys(config)` plus `{heading, breadcrumb, actions}`; wizard/workspace/record copy everything (`...data`) | list, master-detail, dashboard, settings, tool factories | one table row each would do |
| Callback binding with `ctx` | 11 factories write `el.x = a => cfg.x(a, ctx)` by hand | all factories | wrong-arity `ctx` placement is per-type: `load(query, ctx, signal)` (list), `load(id, ctx, signal)` (record), `load(query, ctx)` (master-detail), `load(ctx)` (wizard), `loadItem(id, ctx)`, `run(values, ctx)` |
| Callback names and signatures (data in) | `load(query)`, `load(id)`, `load()`, `loadItem(id)`, `load(key)`, `mount(panes)`, `mountDetail(pane,id)`, `mountStep(pane,step)`, `run(values)`, `save(values)`, `submit(values)` | elements | only list and record get the `AbortSignal`; Blazor `PkCallbackSlot` supersedes per call, so the two runtimes already differ |
| Dirty guard | beforeunload listener in record and wizard elements (identical pattern, rule 5 compliant); route-leave in factory `svc-leave-guard` for record only | record-page.js:32, wizard-page.js:24, svc-leave-guard.js | wizard has the `pk-wizard-dirty` event but no factory guard |
| Default toasts | list and record factories only (`svc-page-toasts`) | list.js, record.js | settings `save`, tool `run`, wizard `submit` do not toast; inconsistent |
| `fill` (fill-height, #1554/#1675) | prop `fill` on master-detail and workspace only, each with its own 3 to 4 `:host([fill])` rules in its css; list, record, settings, dashboard none | master-detail-page.css:2/17, workspace-page.css:2-8 | the shell is the common ancestor and owns no `fill` |
| Static slotted mode (#1829) | doc and master-detail with different detection rules (`firstElementChild && !config.items` vs `> [slot=list] && !config.list`), both decided at connect, both `preUpgrade: visible` | STANDARDS "Static slotted pages" | the convention is written once but implemented twice; nothing else opts in |
| Event naming | `pk-action {key}` (8 types), `pk-action` with null detail (not-found), `pk-record-*` (5), `pk-wizard-*` (2), `pk-select/row-click/bulk` (list), `pk-retry` (states) vs `pk-page-shell-retry` (shell) | meta.json | `pk-retry` and `pk-page-shell-retry` are the same event under two names |
| Once-only connect wiring | `if (!this.$w) { this.$w = true; loadElements(this.shadowRoot); ... }` | 9 of 13 files | rule 5 idempotence done by hand each time |
| Config-diff rebuild keys | `JSON.stringify(config)` compare in note, tool, record (`shape()`), master-detail `$id` | note, tool, record | |
| Duplicate metadata | each type states its config keys three times: `meta.json` description, factory `PAGE_TYPE.configKeys`, and the code that copies them | meta + factory | `PAGE_TYPE` is read at build time by `core/tools/audit/data.mjs` |
| Fill/field building | tool uses `page-fields.js`; settings and record use `pk-field-group`; wizard builds its own steps | page-fields.js, settings, record, wizard | out of scope here, but a fourth place that "a form in a page" is built |

What is already shared and healthy: `pk-page-shell`/`pk-page-header` (8 users), `showState`/`renderState` (all but print, note), `mountTitled` (all but doc), `showTabs` (dashboard only today), `loader.js` on-demand element loading, `createPage` for the Blazor `PageBase` model, `svc-*` lazy services.

## 4. Gaps and inconsistencies against the standards

- **Static mode** (STANDARDS "Static slotted pages"): defined for two types and written twice. States, print, workspace and tool already render slotted content, but none of them is documented as a static mode, and note, not-found, list, record, settings, dashboard and wizard cannot be written as plain markup. Decision for the owner: which types need the convention (a server-rendered site wants note, not-found, states, settings sections, probably list).
- **Ownership** (rules 1 to 5): no violation found in the elements read; the shared `showTitleBar` writes `$bar` expando and children into a shadow part it is given, and states/not-found append a `drawn` div to their own light DOM (rule 3 allows "a node it makes for the caller", the comment in states-page.js argues it). The `beforeunload` listeners are correctly added in `connected` and removed in `disconnected`. Rule 10 (no base growth) is the one constraint on option A (section 6).
- **Tiers**: C1 and C4 are clean (baseline empty). One tier observation: `pk-list-page` is composed by `pk-master-detail-page` (page inside page, same tier, allowed) and `pk-list-page` wraps a component (`pk-data-table`) and the shell; a base mixin in `js/` is not an element and so is outside C1.
- **Blazor thin wrapper** (rule 16): holds. All 13 are generated; no timers or stale guards in hand-written code. The risk is option B (section 5), which would invite a hand-written `PkPage`.
- **Tokens, CSP, silent failure**: not re-audited here beyond reading; the page css files are small (22 to 59 lines) and the elements use `this.log` / `warnOnce` (record, wizard, master-detail, workspace, doc, print), but dashboard, list, settings, tool and the two state pages never log. Master-detail's `try { s(); } catch (err) { this.log.error(...) }` is the correct form.
- **a11y**: pages do not own `<main>` (the shell does). Title handling differs: note and doc build their own level-1 heading, the shell types slot a `pk-heading` level 1 from the factory (`titleHeading`), wizard puts an `h2` with `tabindex=-1` in its card, and the state pages rely on a slotted title (else the drawn empty-state heading is the only heading). Heading level of a standalone `pk-states-page` without a factory was not verified in a browser; flag for the build-out PR's scenario.
- **Missing coverage**: no browser case or scenario for not-found or states (7 unit tests each), one case each for tool, wizard, print.
- **Naming**: `title` (record) vs `heading`; `pk-retry` vs `pk-page-shell-retry`; `recordId` (master-detail host attribute) vs `config.id` (record); factory param `idParam`/`param`; `load` meaning four things.

## 5. Options

Common vocabulary for all options. A **construct** is a page type described by what it adds to a fixed frame:
regions (`header` = title bar, `state` = whole-page loading/empty/error, `body`, optional `bar`/`aside`), one **data source** (`load`, `mount` or `run`), one **lifecycle** (stale guard, dispose on disconnect, dirty guard), one **static-mode rule**.
No option adds a new element (owner rule: prefer flags). All keep the 13 tags unless stated.

### Option A: a shared page mixin and helpers (elements stay, base is code)

Add `core/js/page-base.js` exporting `pageBase = Base => class extends Base`, applied inside each page's existing `export default Base => class extends pageBase(Base)`. The build already wraps a behaviour function (`tools/build.mjs`), so no build change.

- **Base owns**: once-only connect wiring (`$w`, `loadElements(shadowRoot)`); `startRun(fn)` = generation guard + AbortSignal + dispose-on-disconnect + the standard loading/error/retry state in the shell region (collapses the six stale guards; internally can reuse `createLifecycle` so the Blazor fixture stays the one source of rules); `dirtyGuard()` for the beforeunload pair; `decideStatic(predicate)` evaluated once at connect (static convention in one place); title-bar sync; the shell `fill` property delegated to `pk-page-shell` (see overlap with #1675).
- **Each type adds**: its body and its data/callback shape only.
- **API**: additive. No prop, slot, event or tag removed, so the API baseline (`site/scorecard/api.baseline.json`) is unchanged; a fix such as the tool guard is a patch. Optional follow-up aliases (section 7 step 6) are minor.
- **Blazor**: none (mappings unchanged, no handwritten growth). The existing `page-lifecycle.json` fixture keeps core and C# in step.
- **Size** (estimate): remove about 25 lines in each of master-detail/workspace, about 20 each in record/wizard, about 10 in doc and dashboard, plus nine `$w` blocks: roughly 3 to 5 KB raw from elements; add about 1 KB for the base, net 2 to 4 KB raw (1 to 1.8 KB gz). Page elements are not in the three page-weight reference pages (button, form, table) in `page-weight.ceiling.json`, so that ceiling is untouched; the gain is in the core package (the packed ceiling of 291,492, where 8,192 is marked temporary headroom).
- **Rule 10**: `tests/element-surface.test.mjs` freezes `PkElement.prototype` and its exports, not the page layer. A mixin in `js/` over `PkElement` does not add a hook PkElement calls. It is nevertheless a base-class growth in spirit: **owner decision needed** that rule 10's intent is satisfied by a page-only mixin; STANDARDS must say so (a "Page types" section).
- **Risks**: the mixin becomes the new place for page logic to accumulate (cap it by size in a test); `createLifecycle` is promise-returning while elements use sync `$gen`, so the adoption must keep each type's timing (record's "loading synchronously before the first await").

### Option B: declarative constructs over one generic `pk-page`

One element, `pk-page`, with `type="list|record|..."` and a page definition (`regions`, `source`, `states`); today's tags become presets or aliases.

- **Base owns**: everything in A plus layout and the region set; types are data.
- **API**: either removes 13 public tags (breaking, major bump, API baseline rewritten and every consumer, skill and sample migrated) or keeps them as alias elements, which is A plus a new generic element and a second way to do each thing.
- **Blazor**: the 13 typed wrappers (record's mapping alone carries 5 typed events and 9 parameters) would become one `PkPage` with a JSON definition, losing typed parameters and `RenderFragment` slots, or the generator must keep emitting 13 typed shells over it. Either breaks "thin 1:1 wrapper" pressure or multiplies mapping work. High risk to `handwritten.baseline.json`.
- **Size**: the unique logic is about 65% of the bytes and does not shrink; a runtime-interpreted definition adds an interpreter. Likely neutral to worse in the core package.
- **Overlaps**: would force a #1656 decision first (is `pk-page` core, and do the big types move out?).
- **Verdict**: too big for the gain; keep the idea as the vocabulary above and revisit after #1656 decides what ships where.

### Option C: shared factory layer only (elements untouched)

Replace the 13 hand-written factories with `definePage({ tag, titleKey, copy: [...], callbacks: { load: ['id','ctx','signal'], ... }, events: {...}, services: [...] })` rows, applying `ctx` in one place and `createLifecycle` for any `load`/`save`/`run`.

- **Base owns**: element creation, config copy, `titleBarKeys`, ctx binding, lifecycle for callbacks, `mountTitled`, dispose, `PAGE_TYPE` metadata derived from the same row (kills the third copy of the config keys). **Type adds**: a row; list/record/doc keep an escape hatch function for toasts, leave guard and search (about 9.2 KB of the 25.4 KB).
- **API**: none for elements; the factory contract (`config`, callback arity with `ctx`) is public for app authors and must not change, so the rows encode today's arities exactly.
- **Blazor**: none.
- **Size** (estimate): nine simple factories (about 13 KB raw) become about 9 rows of 250 to 400 B plus a 1.5 to 2 KB generic runner: saves about 7 to 9 KB raw (3 to 4 KB gz) in the lazy page chunks. These chunks are outside the app entry graph (`appEntryGzKb` hard cap untouched).
- **Risk**: lowest. Does not touch the duplication in elements (stale guards, shell), which is where the user-visible bugs live (tool has none).

### Option D: consolidate near-duplicates by flag (orthogonal; pair with A and/or C)

- `pk-not-found-page` into `pk-states-page` (preset `state="empty"`, default copy, `label` -> action): both are about 20 lines; keep both tags (removal is breaking) with not-found a thin preset, unify `pk-retry` / `pk-page-shell-retry`, and let them sit on `pk-page-shell`'s own state props. Saves about 1 KB raw.
- `pk-master-detail-page` and `pk-workspace-page`: not merged (different phone behaviour and public attributes) but share one mount-region helper from A.
- `pk-note-page`: could become a documented slotted default (heading + pk-card + prose is expressible in markup, which also gives it a static mode); keep tag, drop the config builder in a minor.
- `pk-print-page`: stays separate (adopted stylesheet, `@page`); it is the one type with no frame to share.

### Comparison

| | A mixin + helpers | B generic `pk-page` | C factory layer | D consolidate |
|---|---|---|---|---|
| Fixes element duplication (guards, `$w`, static decide) | yes | yes | no | partly |
| Fixes factory duplication | no | yes | yes | no |
| Public API change | none | breaking or alias duplication | none | none to minor |
| Blazor / mappings | none | large | none | none |
| Net core bytes (estimate, raw) | -2 to -4 KB | about 0 to +, uncertain | -7 to -9 KB (lazy) | -1 KB |
| Needs owner ruling on rule 10 | yes | yes | no | no |
| Reversible per PR | yes | no | yes | yes |

## 6. Recommendation

**A and C together, in that order of urgency, plus the cheap parts of D. Do not do B now.**

Reasoning: the duplication that can bite a user is in the elements (six stale guards, one missing, two copies of the same mount block, two copies of the static rule), and the byte duplication is in the factories. A fixes the first, C the second, neither breaks a tag, prop or event, neither touches Blazor, and each lands in small PRs. B is the same two fixes plus a new public element and a Blazor rewrite for no byte gain. The "construct" idea is kept as the documented model (section 5 vocabulary, a new "Page types" section in STANDARDS.md): a page type = frame regions + one data source + the shared lifecycle + the static rule.

Ask the owner to confirm before A starts: that a page-only mixin in `js/` is consistent with rule 10 (the test does not forbid it).

## 7. Migration as small PRs (each about 400 lines or fewer, each leaves `main` releasable)

1. **Docs only**: STANDARDS.md "Page types" section (the construct model, the shared helpers, which types use them, the rule 10 reading) and a tracker issue with the checklist below. No changelog fragment (docs).
2. **Lifecycle helper for elements** (A): `js/page-base.js` with `startRun` and `once`, built on `createLifecycle`; adopt in master-detail and workspace (identical blocks) with their existing tests; add a test that the base stays under a size cap. Changelog: fixed/notes.
3. **Adopt in record and wizard** (A): replace `$gen` and the two `beforeunload` copies with `startRun` and `dirtyGuard`; browser cases for record and wizard unchanged and re-run.
4. **Close the gaps** (A): stale/destroyed guard for `pk-tool-page.runNow`, doc `loadItem` and dashboard per-widget tokens onto `startRun`; a unit test per type that a superseded result is dropped. Changelog: fixed.
5. **Factory table** (C): `definePage` runner plus the nine simple factories as rows, `PAGE_TYPE` derived; the audit data build (`core/tools/audit/data.mjs`) test and `tiers.test.mjs` must stay green. Then list/record/doc through the escape hatch in a second PR.
6. **Naming alignment** (additive, minor): accept `heading` for the record's page title next to `title`, `pk-retry` aliased to the shell's retry event, `fill` moved to `pk-page-shell` and exposed on every type that uses the shell; deprecations through the existing `deprecations` mechanism, nothing removed.
7. **Static-mode decision per type** and one shared `decideStatic` (A), only for the types the owner names; each adds a scenario at 1280 and 375 (relates to #1878).
8. **D**: not-found as a preset of states; optional note slotted mode.

Every PR also updates docs, gallery samples and `scripts/skills/` workflows (owner directive) and, where the UI could shift, runs the UI review for the touched types.

## 8. Overlap with open issues

| Issue | State | Effect of the options |
|---|---|---|
| #1878 static doc-page desktop nav about 369 px; pk-side-nav unsuitable as static master list (owner design question, ledger #1253) | open | A puts the static convention in one helper so one fix and one measuring scenario cover doc and master-detail. None of the options answers the question of which element is the supported slotted nav; that stays an owner decision (below). Do not fold it into step 7. |
| #1675 fill-height regions and a content-area container, so a host wrapper is not needed | open | Another agent is reproducing it on `agent/1675-layout-repro`; not duplicated here. Overlap: `fill` is hand-written in master-detail and workspace css only (3 to 4 `:host([fill])` rules each); moving it to `pk-page-shell` (step 6) is the page-level half, and the content-area container on the shell/page slot is the app-shell half. Sequence step 6 after that reproduction lands. |
| #1829 static light-DOM pages | closed | The convention A would centralise; any change must keep `preUpgrade: visible` and the "decided once at connect" rule. |
| #1656 separate packages | open | All 13 pages are in core today. A and C reduce core bytes (about 3 to 6 KB gz, estimate) and make a later `plainkit.pages` split possible because the shared mixin and runner stay in core. B would have to be decided after #1656. |
| #1644 size of form + table + dialog page | open | No direct effect: the page-weight reference pages (button, form, table; `page-weight.ceiling.json`) do not load a page type. The ceilings are not raised and not touched by any option. |
| #1253 debt ledger | open | Add: heading/title naming drift, `load` signature drift, tool-page missing stale guard, and the #1878 nav question, so they are tracked rather than fixed in an unrelated PR. |

## 9. Open questions only the owner can answer

1. Is a page-only mixin (`js/page-base.js`) acceptable under rule 10, "the base class does not grow"? (A needs a yes; the frozen-surface test does not cover it.)
2. Is "construct" a documentation model only (recommended), or do you want a single `pk-page` element eventually (option B), accepting a major version and a Blazor redesign?
3. Which page types must support a static, JavaScript-optional mode beyond doc and master-detail (note, not-found, states, settings sections, list)?
4. For #1878: which element is the supported slotted nav and master list in static mode, since `pk-side-nav` is not one on desktop or phone?
5. May the shared names converge (`heading` for the page title, one retry event, one `load` signature carrying an `AbortSignal` for all), as additive aliases first and removals only at a major?
6. Should default toasts (today list and record only) apply to settings `save`, wizard `submit`, tool `run`, or stay per type?
7. Is merging `pk-not-found-page` into `pk-states-page` (tag kept as a preset) acceptable, or do you want the two public tags to stay separate implementations?
