# One action model for page templates: typed new-record action and actions list (#1943)

Status: design only. Verified against `main` at 9c44516c. Builds on the page-types audit (`docs/superpowers/specs/2026-11-04-page-types-audit.md` on `origin/agent/pagetypes-audit`, tracker #1929, approved 2026-11-05: options A + C + the cheap parts of D) and on #1940 (`collapse: always`, queue 53).

## 1. What the consumer asked
A consumer app has about 25 list and tool pages, each hand-writing buttons in an `ActionsContent` slot. When the toolbar convention changed (icon-only with the label as name and tooltip, one-row header, overflow into a menu on small screens) every page was edited, because the template takes markup, and the config Add action accepts only a link, not a callback. Asked, on `PkListPage`, `PkToolPage`, `PkRecordPage` or their shared header: a **new-record action** (label, icon, href or `EventCallback`) drawn as the primary action; an **actions list** (label, icon, href or callback, optional disabled/busy, optional group for an overflow menu); presentation decided only by the template (`collapse: always|phone|tablet|none` for the whole toolbar, tooltip and accessible name from the label, overflow on small screens, focus order); the content slot stays for unusual controls.

## 2. What the code does today (three different action models)
1. **Shared title bar** (`core/js/page-shell.js` `showTitleBar`, lines 56 to 95): config `actions: [{ key, label, href?, variant?, hint? }]` become `pk-button slot=actions` (a `pk-tooltip` wrapper when `hint` is set); a click without `href` raises `pk-action { key }` on the host. Used by dashboard, list (title bar), master-detail, settings, tool, wizard, workspace, record via `titleBarKeys` (`actionsOverflow`, `overflowLabel`, `homeHref`...). `pk-page-header` already has `actionsOverflow` (overflow into a menu). No icon, no `collapse`, no disabled or busy state, no group.
2. **List toolbar** (`core/pages/list-page/list-page.js` `fill()` lines 71 to 90): config `actions: [{ label, href?, variant?, icon?, collapse? }]` and `bulkActions: [{ id, label, variant? }]`. A link only (no event for a non-href action); `icon` gives `iconName` and `collapse` defaults to `phone`; `bulk` raises `pk-bulk { action, selected, scope, query }`. `pk-data-table` separately has `addLabel` plus the `pk-add` event and an `add` part (`data-table.js`, `[part=add]`, `collapse="phone"`), but `pk-list-page` never exposes it (`TABLE_KEYS` has no `addLabel`), so a config "Add" can only be an `actions` link (the issue's complaint).
3. **Slots**: every page offers an `actions` slot (list: `actions` into the title bar, `toolbar` into the table toolbar); Blazor exposes them as `ActionsContent`, `ToolbarContent`. Nothing enforced or collapsed.
- Record page: its own Edit/Cancel/Save/Delete bar (record-page.js lines 94 to 98), `sticky` moves it into the shell's actions; events `pk-record-*`, not `pk-action`.
- Collapse: `pk-button` has `icon` (icon-only at every width) and `collapse` phone|tablet (button.meta.json line 140); config can not say "always" (#1940 adds it as a value `always` for list and bulk actions, queue 53).

Related duplication already named by the audit: callback binding with `ctx` is hand-written in 11 factories; `pk-action` vs `pk-record-*` vs `pk-bulk` event names diverge; "names converge as additive aliases" is already approved in #1929 step 7.

## 3. Owner rule check (consolidate controls first)
No new element. Existing elements that take the job by setting: `pk-button` (`icon`, `collapse`, `href`, `disabled`, `busy`), `pk-tooltip`, `pk-menu` and `pk-page-header` (`actionsOverflow`). Result: one **action descriptor** and one **renderer function** in `js/page-shell.js`/a new `js/page-actions.js`, used by the shell title bar, the list toolbar and `bulk`; zero new elements.

## 4. Options
A. **Per-page typed parameters only** (`NewRecord`, `Actions` on PkListPage/PkToolPage/PkRecordPage in Blazor, three config shapes in core). Fixes the consumer in Blazor, keeps three models, three collapse behaviours and drift. Rejected.
B. **One descriptor, one renderer, a page-level presentation setting (recommended).**
```
Action   = { key, label, icon?, href?, variant?, hint?, disabled?, busy?, group?, collapse? }
Actions  = Action[]            // config.actions (title bar) and config.toolbarActions? see below
primary  = Action              // config.newAction: drawn first, variant primary
config.actionsCollapse = 'always' | 'phone' | 'tablet' | 'none'   // default 'phone'; one value for the whole bar
config.actionsOverflow = n | true   // exists today (pk-page-header); group names a menu entry
```
`key` is the callback id: the page raises one `pk-action { key }` (already the name on 8 types; record keeps its `pk-record-*` events for its own buttons and **adds** `pk-action` for custom entries; list's `pk-bulk` stays for bulk). A new-record action is just the first entry with `primary: true`, which also replaces `addLabel`/`pk-add` on the list (the data-table maps `newAction` to its `add` part or to the title bar depending on `toolbarInHeader`). Presentation (icon-only, tooltip, overflow, order) lives in the renderer only: icon and label are always both set, the renderer sets `pk-button` `icon-name` and `collapse` from `actionsCollapse` and puts a `label` plus a `pk-tooltip` when icon-only, so changing the convention is one config value, or one default in the renderer. Groups: entries sharing `group` fold into one overflow `pk-menu` (ids = keys); `actionsOverflow` stays the existing header mechanism for width-based overflow. Disabled/busy are descriptor fields; the page re-renders on config change (rule 5: the host owns config, the page owns the shadow). Custom markup: the content slots stay and render **after** the descriptor items, inside the same collapse context (a `--pk-actions-collapse` hint is not needed: unusual controls are the consumer's).
C. **A new `pk-action-bar` element.** Rejected by the owner rule (section 3): the shell title bar and `pk-page-header` already own this region.

Recommendation: B, as steps of the page-types tracker (#1929), after its factory layer (`definePage`) lands, because the renderer needs one place to bind `ctx`.

## 5. The one model across the four hosts
| Host | New-record | Actions | Collapse | Event | Bulk |
|---|---|---|---|---|---|
| `pk-list-page` | `newAction` (title bar primary, or toolbar `add` part when `toolbarInHeader`) | `actions` (title bar) and `toolbarActions` (table toolbar) | `actionsCollapse` | `pk-action {key}` (new), `pk-bulk` unchanged | `bulkActions` use the same descriptor + renderer |
| `pk-tool-page` | `newAction` allowed (rare) | `actions` through `showTitleBar` | same | `pk-action` | n/a |
| `pk-record-page` | n/a (it is a record) | `actions` added to its Edit/Save bar | same, and it follows `sticky` | `pk-action` plus its own `pk-record-*` | n/a |
| `pk-page-shell` | the same descriptors passed as a `config`-like prop set | `actions` json prop | `actionsCollapse` attribute | `pk-page-shell-action`? kept as the aliased `pk-action` | n/a |
The renderer is the single place that decides: icon-only vs text per width, tooltip and accessible name from the label, overflow grouping, and focus order (primary first in DOM and visually; a roving tab stop is not added, each button is one tab stop). `pk-page-shell` is the base all page elements already use (page-types audit, headline 1), so the `showTitleBar` signature gets the new fields additively and `list-page.js fill()` is removed in favour of the same function (net code smaller).

## 6. Blazor: typed parameters now vs the generic-package direction
Now (recommended, small): typed parameters generated from the mapping, with no new hand-written files:
- `PkAction` record (`Label`, `Icon`, `Href`, `Key`, `Variant`, `Hint`, `Disabled`, `Busy`, `Group`, `OnClick` as `EventCallback`) added to `PkListTypes.cs`/a new `PkActionTypes.cs` (types are data, like `PkListRequest`), plus `PkListPage.NewAction` and `Actions` (`IReadOnlyList<PkAction>`), `ActionsCollapse` enum on the list, tool and record mappings (`"extra": true` where the component is `existing`). The wrapper serializes the descriptors to the `config.actions` JSON (key = the descriptor's generated id) and, on `pk-action`, finds the entry by key and invokes its `OnClick`. This is the same pattern the generator already uses for `Columns` and `Cells` (a typed list turned into config plus a dispatch). **A mapping feature, not hand code**: add a `"actionList"` kind to the generator once, and rule 16 (thin 1:1 wrapper, no timers or layout recipes in hand-written components) is kept; callbacks do not cross the boundary, only the key does.
- Today's `ActionsContent` stays.
The owner's stated future direction (a generic Blazor package whose typed components and IntelliSense are **derived from element metadata**, no recompile for prop changes) fits this exactly if the descriptor is declared in metadata instead of in C#: put the descriptor's shape (`Action` fields, `actions`/`newAction` as list-of-descriptor props with a `callbackKey: "key"` marker) in each element's `meta.json` (a prop of `type: "json"` gains a `shape` entry), the generator (today) and the generic package (later) both read it, so the typed C# `PkAction`, its IntelliSense and the dispatch are generated either way. Doing the metadata `shape` in core first (meta.json is the one source) means this spec adds **no throwaway Blazor code**: the typed parameters now are the output of the generator the generic package will replace. Recommendation: put the descriptor shape in `meta.json` (audit-checked) and generate; do not hand-write `PkAction`. Open: whether the owner wants the `shape` declaration schema designed first (the recipe spec is not written yet; memory note 2026-11-05).

## 7. Byte cost (never raised)
Page-layer code is lazy, outside the three reference pages (button, form, table; page-weight.ceiling.json) and outside the app entry graph hard cap `appEntryGzKb`, but inside the core package ceiling. New `js/page-actions.js` (renderer + group menu + collapse + tooltip): about 1.4 KB raw (650 B gz); `showTitleBar` in `page-shell.js` (8,480 B raw) loses its action loop (about 700 B raw) and the list `fill()` (about 900 B raw) goes: **net about 0 to -400 B raw**. `newAction` plumbing in list/data-table: +200 B raw. Estimated net core effect: -0.2 to +0.4 KB gz; measure on the integration tree. `pk-menu` is loaded on demand only when a group or overflow exists (the loader), and `pk-tooltip` only for icon-only mode.

## 8. Measuring cases and scenarios
Browser cases (new `cases-page-actions.js`, 1280 and 390):
1. `actionsCollapse: always`: every action button's rect width equals its height (icon only), accessible name equals label (`aria-label` or text), tooltip present; `none`: buttons wider than tall at 390 too; `phone`: switch at 640 (resize across the breakpoint).
2. `newAction` is the first focusable in the actions region and the last-child-visually-primary rect compare: primary left of the secondary buttons at 1280 (inline order), same at 390.
3. Groups: with `group` entries and width 390, the grouped items are not in the bar (rect not visible) and appear in the menu in order; the menu opens on click and Escape closes it, focus returns to the trigger.
4. One-row header: actions rect shares the heading row (same top within 2px) at 1280.
5. Disabled and busy: `aria-disabled` / `aria-busy`, a click raises no `pk-action`.
6. Event: a callback entry raises `pk-action {key}`; an `href` entry navigates and raises nothing; list `pk-bulk` unchanged.
7. Blazor browser lab case: `OnClick` of a descriptor runs in the sample (real interop dispatcher; `scripts/blazor-browser-lab-cases.mjs`), including after a re-render with a changed list.
Scenario `page-actions.js` (elements: list-page, tool-page, record-page, page-shell): resize 1280 to 390 to 640, menu open, focus ring; `t.noOverlap`, `t.within(actions, header)`, `t.ringUnclipped`.

## 9. Migration and back-compat
Additive. Existing `actions` entries (`label`, `href`, `variant`, `icon`, `collapse`, `hint`) are valid descriptors; `collapse` per entry keeps working and `actionsCollapse` is the default for entries without one. `pk-action` was already the event of 8 types; list gains it (a non-href action was dead before, so nothing breaks). The record page keeps `pk-record-*`. `addLabel`/`pk-add` on `pk-data-table` stay (the standalone component) and `newAction` maps onto them. `ActionsContent`/`ToolbarContent` unchanged. Names: `heading`/`title` and event alias convergence stay on #1929 steps; this spec uses `pk-action` as the target name.

## 10. Risks
Scope creep into the audit's factory layer (sequence after `definePage`, or ship the renderer first with the factories binding keys by hand, 11 sites); overflow and collapse together can fold an action twice (the renderer decides once: width overflow is the header's, icon-only is the button's; document); icon-only buttons need icons, so `actionsCollapse: always` with an entry that has no `icon` leaves it as text and `warnOnce`s (never a nameless button); Blazor re-render churn (the config JSON is compared by `JSON.stringify`, as `fill()` does, so unchanged lists rebuild nothing).

## 11. PR split (about 400 lines each)
1. `js/page-actions.js` renderer with `collapse always` (shares #1940's value; coordinate so it is one implementation), used by `showTitleBar`, tests (about 350).
2. List adopts it (`fill()` removed), `newAction`, `toolbarActions`, `pk-action` on list; cases 1 to 6 (about 350).
3. Groups/overflow menu, disabled/busy, record and tool adoption, scenario (about 350).
4. `meta.json` descriptor `shape`, generator `actionList` kind, Blazor typed `NewAction`/`Actions`/`ActionsCollapse` on list, tool, record, lab case, docs, skills (about 400, mostly generated; two PRs if the generator part exceeds the budget).

## 12. Open questions for the owner
1. One config value for the whole bar (`actionsCollapse`) as asked, or also per entry (kept today)?
2. Is `pk-action {key}` the one event name (list gains it; record keeps `pk-record-*` for its own buttons)?
3. Does the new-record action replace `addLabel`/`pk-add` on the list, or is `addLabel` kept as a second route to the same button?
4. Blazor: derive the typed descriptor from `meta.json` `shape` now (my recommendation) or accept a short-term hand-declared `PkAction` record before the generic-package spec exists?
5. Should the overflow menu be width-driven for all actions (as `actionsOverflow` is), or only the entries with a `group`?
