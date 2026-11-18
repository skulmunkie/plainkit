# Record page, detail layout and a non-form `sections` page (#2010)

Status: design only. Verified against `origin/integration/next` (0.30.0 plus queue 55). Builds on #1929 (page types: shared base, convergent names) and #1943 (one action model, `docs/superpowers/specs/2026-11-12-page-actions-model.md`, design only, not yet implemented).

## 1. The ask and the finding
`PkRecordPage` is form-shaped. A read-mostly record page (title bar, breadcrumbs, docked section tabs, a primary action, an actions menu that collapses on a phone) has no page type, so the consumer hand-builds the title bar around `PkDetailLayout`. Owner decisions: build a thin `sections` page (pk-page-shell + header tabs with `hideTabs` + pk-detail-layout, sections as config data), reuse #1943's action item shape, and check whether `pk-record-page` and `pk-detail-layout` should be consolidated (owner rule: consolidate controls first).

**Finding: they are already layered, not duplicated.** `pk-record-page` (tier page, `record-page.meta.json`) renders `<pk-page-shell>` holding a `<pk-detail-layout part="layout">` (`record-page.html` line 1) and draws its main column and sidebar into it. `pk-detail-layout` (tier component, `detail-layout.meta.json` line 6) is the layout part only. The resemblance is vocabulary: both talk about a main column, a sidebar, "sections" and a collapse to one column. The clean tier answer (option c below) is therefore the current state; the gap is only that no second page uses the same composition.

## 2. What each is today
| | `pk-record-page` | `pk-detail-layout` |
|---|---|---|
| Tier / group | page, pageType `record`, "Page types" | component, "Layout & structure", `preUpgrade: visible` |
| Hand-written source | `record-page.js` 233 lines, html, css | `detail-layout.js` 87 lines, html, css |
| Shipped gz (js + element + css) | about 6.6 KB | about 3.9 KB |
| Props | config (json: id, fields, sections, sidebar, titleField, heading, title, breadcrumb, actions, ...), mode, deletable, cancellable, sticky, wrapTitle, busy, error, dirty | sidebarFirst, sidebarTwoUp, section, tabsFrom, hideTabs, sectionsAbove, tabParam, hideNext, nextLabel |
| Slots | badges, main-before, main-after, side-after | default (main), sidebar |
| Parts | header, layout, column, aside, main, side, bar, edit, cancel, save, delete, notice, state | grid, main, sidebar, tabs, next |
| Events | pk-action, pk-record-dirty, -cancel, -change, -save, -delete | pk-section-change (cancelable) |
| Owns | load/save lifecycle, view/edit modes, form and validation, states, dirty guard, title bar (`showTitleBar`, `js/page-shell.js`) | two-column grid, sticky sidebar, collapse at a container width (48rem), `data-pk-section` grouping into tabs, Next button, `tabParam` |
| Used by | app page type `core/js/app/pages/record.js`, gallery `record-page.data.js`, Blazor `PkRecordPage` (`blazor/mappings/record-page.json`) | record-page, settings-page (section nav, `settings-page.js` line 43), record-form, layout `core/layouts/record-detail`, gallery, Blazor `PkDetailLayout`, 4 review scenarios, `cases-layout.js` |

Real overlap: (1) both expose "sections" (record-page `config.sections` are cards by field; detail-layout `data-pk-section` are tabs); (2) `pk-record-form` and `pk-page-header` already have docked tabs as data (`page-header.meta.json` line 126: `{ value, label, count?, visible? }`). That is three spellings of one idea: `{ heading, fields }` (record cards), `{ id, label }` (`showTabs`, `page-shell.js` line 106, used by dashboard) and `{ value, label }` (header tabs). Real differences: record-page is about a record's data and edit lifecycle; detail-layout knows nothing about data, forms or the title bar, and works static (`preUpgrade: visible`).

Tier rules: C1 holds today (a page names a component). C4 does not apply (neither is `tier: element`). Neither is in `core/tools/tiers.baseline.json`.

## 3. Options
**(a) Keep both, add the `sections` page as a thin composition.** New page `pk-sections-page`, about 90 lines of JS (title bar via `showTitleBar`, header `tabs` from config, the layout with `hideTabs`, two listeners). No change to either existing element, no migration; Blazor gets one generated component. Page-layer cost only: about 1.2 KB gz, lazy, outside the three reference pages and the app entry graph. Tests: node (config to tabs, section sync), meta/mapping guards, a browser case, a scenario. 2 PRs.

**(b) Fold detail-layout into record-page as a mode.** Breaks the tier model: detail-layout has independent consumers (settings-page, record-form, plain HTML) so it must stay, and folding would duplicate the grid in a page and push the 6.6 KB record page onto consumers who want no form. The record page would gain a non-form branch (load, save, dirty, delete all optional) in a 233-line file, and `PkRecordPage<TItem>` stays generic. Rejected: it moves the problem rather than removing duplication.

**(c) detail-layout is the layout part both pages compose.** True for the record page already. Adopting it explicitly means: a STANDARDS "Page types" paragraph (a page composes `pk-detail-layout`, `pk-page-header` tabs and `pk-page-shell`; none re-implements the grid or the tab-to-section sync), and the sections page as its second consumer. The header-tabs to layout sync (the `hideTabs` recipe in the detail-layout example "Tabs from the page header") is hand-written today (`record-form.js` lines 12 to 34, consumers); the shared piece is a small page-layer helper `js/page-sections.js` (`bindSections`, about 0.4 KB gz) used by the sections page now and by record-form and settings-page only when they are next touched (no behaviour change).

**(d) A `tabs` setting on record-page.** Header tabs for its cards would keep the form coupling that #2010 names as the blocker. Revisit later as an additive feature on the same helper; no decision needed now.

## 4. Recommendation: (a) with (c)'s helper, in phases
No fold: layered already, detail-layout has independent consumers, lowest risk for the consumer. The owner rule (check before adding a new `pk-*`) is met: every existing page type that composes the shell is form-shaped (record), a tool, a list or a wizard; the unmet need is "shell + tabs + layout, no data lifecycle", and a flag on record-page would carry its form baggage.

Phases, each about 400 lines or fewer and leaving `main` releasable:
1. **Helper and docs.** `js/page-sections.js` plus its node test; the STANDARDS paragraph. No consumer yet (docs/tooling: `no-changelog` label with the reason).
2. **`pk-sections-page`** in `core/pages/sections-page/` (tier page, pageType `sections`), meta.json, gallery example, app factory `core/js/app/pages/sections.js`, browser case, scenario, skills workflow entry, changelog fragment (added).
3. **Blazor.** `PkSectionsPage` generated from `blazor/mappings/sections-page.json`: `Config`, `Sections` (typed `PkSection { Id, Label, Count? }`), `Section` (two-way), `Actions`, `ActionsOverflow`, `ActionsContent`, child content per panel. `PkToolPage` gets `ActionsOverflow` as an `"extra": true` mapping entry (the other half of #2010).
4. After #1943 lands: `newAction`, `actionsCollapse`, `group` work on the sections page with no change of its own (it calls `showTitleBar`).

### Shape of the page
Tag `pk-sections-page`, Blazor `PkSectionsPage`, page type `sections`.
```
config = {
  heading, title?, breadcrumb?: [{ label, href? }], badges?,
  sections: [{ id, label, count?, visible? }],   // the tabs; panels are slotted by id
  section?: id,                                   // selected (default: first visible)
  tabParam?: 'tab',                               // keeps the section in the address
  sidebarFirst?, sidebarTwoUp?,                   // pass-through to pk-detail-layout
  actions?: [{ key, label, icon?, href?, variant?, hint?, disabled?, busy?, group? }],
  actionsOverflow?, overflowLabel?,               // shell keys (titleBarKeys)
  newAction?, actionsCollapse?                    // after #1943 (phase 4)
}
```
- **Slots:** `badges`, `actions` (as every page type), and the panels: light-DOM children carrying `data-pk-section="<id>"` (main column) or `slot="sidebar" data-pk-section="<id>"` (that section's summary card). The page only forwards them into the layout (host owns light children, element owns its shadow tree: STANDARDS "Ownership and reactivity"). An id with no `sections` entry is logged once (`warnOnce`) and shown always.
- **Parts:** `header` (the shell), `layout` (detail layout with `hide-tabs`, `hide-next` by default because the strip is always docked).
- **Tabs and layout sync:** `sections` become the header's `tabs` as `{ value: id, label, count?, visible? }` (one rename, in one place) with `tabsFrom: always`. `bindSections` sets `layout.section` from `pk-tab-change` and selects the tab from the layout's `pk-section-change` (Next, or a form submit that reveals a hidden invalid control); a cancelled change keeps the old tab. The page re-raises `pk-section-change { section, previous }` (the layout's own event, no new name).
- **Primary action and menu:** both from `actions`, the item shape of `showTitleBar` (`{ key, label, href?, variant?, hint? }`) as extended by #1943 (`icon`, `disabled`, `busy`, `group`). The primary action is the first entry with `variant: 'primary'`; entries with `group` form the menu; `actionsOverflow` collapses the rest on a phone. A click without `href` raises `pk-action { key }`, the one event. A dropdown among the actions breaks `actionsOverflow` today (#1737): fixed in the shared renderer, not in this page.
- **No data lifecycle:** no load, save, dirty or states. A host with data to load uses `pk-record-page` or `pk-master-detail-page`; the sections page renders what it is given (works static where the layout does).

## 5. Breaking changes and migration
(a) and (c): none. `pk-record-page`, `pk-detail-layout`, settings-page and record-form keep their API and behaviour. A consumer with a hand-built title bar moves at its own pace: `ActionsContent` buttons become `Actions`, the tab strip becomes `Sections`, `PkDetailLayout` content becomes child panels. A paragraph in the guide "Choosing what to build with" says when to use record, sections or master-detail. (b) would break the typed generic and config keys.

## 6. Budgets and tiers
About 1.2 KB gz for the page and 0.4 KB for the helper, lazy page layer in the core package. No ceiling is raised: phase 2 runs `node scripts/verify.mjs --pack`, and if that tips the core ceiling the work stops and reports (it does not raise it). The 4 KB element rule applies to `tier: element` and this is a page. The page names only `pk-page-shell` (with its header) and `pk-detail-layout`, both lower tiers (C1 clean, nothing added to `tiers.baseline.json`). `detail-layout` and `page-shell` sizes do not change (the helper is a separate module).

## 7. Tests to write (existing tests are not touched)
Node: `page-sections.test.mjs` (tab and section both ways, cancelled change, `visible: false`, unknown id); `sections-page.test.mjs` (config to header tabs and actions, the action item is the same object `showTitleBar` takes, the `group` menu); the generated meta/mapping guards. Browser (measuring, 1280 and 390): tabs docked in the header, exactly one section visible, actions share the heading row, overflow button visible at 390, menu opens and Escape returns focus, `tabParam` deep link. Scenario `sections-page-actions-overflow` (menu open, phone, rtl); every screenshot opened. Blazor: bUnit for the `Sections` and `Actions` mapping; a lab page driven by `blazor-browser` (tab change raises the callback).

## 8. Open questions for the owner
1. **Name.** `pk-sections-page` (pageType `sections`) or `pk-detail-page` / `pk-profile-page`? Recommend `sections-page`: it names what differs and does not collide with `pk-detail-layout`.
2. **#1943 order.** Ship the page first with today's `actions` shape (it needs only `variant: 'primary'` for the primary and `actionsOverflow` for the menu), adding `newAction`, `actionsCollapse`, `group` when #1943 lands, or wait? Recommend ship first. Smallest decision: confirm the first `variant: 'primary'` action and `group` entries are the accepted interim, with no second item shape.
3. **Tab item key.** `{ id, label }` (your wording, and `showTabs`) or `{ value, label }` (header tabs, record-form)? Recommend `id` in config, mapped to `value` internally, and header tabs accept `id` as an alias later (#1929 step 7).
4. **#1737 first?** Fix `actionsOverflow` with a dropdown in the shared renderer before the page ships (recommended), or ship with the limitation noted.
5. **Tabs on the record page (option d).** Park until a consumer asks (recommended); the helper makes it a small additive step.

Refs #2010, #1943, #1929.
