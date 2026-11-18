# Page actions and the new-record action: build plan on the shared title bar (#1943, step 2)

Status: design only, 2026-11-19. Verified against `origin/integration/next`. Supersedes the build order of
`2026-11-12-page-actions-model.md` (that spec's decisions stand: one descriptor, one renderer, `newAction`, one bar-wide `actionsCollapse`, one event
`pk-action { key }`, `addLabel`/`pk-add` replaced by `newAction`, overflow only for `group`, Blazor types from `meta.json`). What changed since: `collapse: "always"`
shipped on `pk-button` and the list (#1955, #1940 closed), `pk-sections-page` shipped (#2010) and waits for this item shape, `PkToolPage` got `ActionsOverflow`.
`definePage` (#1929) is no longer a prerequisite: the renderer is a plain module and factories bind keys through the event.

## 1. Today, per page type

| Host | How it takes actions | New / add | Collapse | Event | Blazor |
|---|---|---|---|---|---|
| shared title bar (`core/js/page-shell.js` `showTitleBar`, 56-95) | `actions: [{ key, label, href?, variant?, hint? }]` to `pk-button slot=actions`, `pk-tooltip` when `hint`; no icon, disabled, busy, group | none | none | `pk-action {key}` for a non-href entry | n/a |
| `pk-page-header` (`core/components/page-header/page-header.js` `overflow()` 12-30) | `actions` slot; `actionsOverflow` (a width or `always`) hides the slot behind one menu, items = slotted buttons (a slotted `pk-dropdown` is flattened) | none | none | clicks the real button | `ActionsOverflow`, `OverflowLabel` |
| tool, settings, dashboard, master-detail, workspace, wizard (`titleBarKeys`, page-shell.js 21) | `config.actions` via `showTitleBar` (tool also forwards `actionsOverflow`) | none | none | `pk-action` | `OnAction` (key), `ActionsContent` slot |
| `pk-list-page` (`list-page.js` 54-62, 84-100) | title bar via `showTitleBar`, plus its own toolbar loop in `fill()`: `actions: [{ label, href?, variant?, icon?, collapse? }]` (link only, no key), `bulkActions: [{ id, label, variant? }]`; `toolbarInHeader` draws no `pk-page-header` (no overflow, #1956) | `pk-data-table` `addLabel` / `pk-add` | per entry `collapse` (phone default with `icon`; `always` shipped) | none for config actions; `pk-bulk` | `ActionsContent`, `ToolbarContent`; config is a JSON attribute |
| `pk-record-page` (`record-page.js` 94-98) | own Edit/Cancel/Save/Delete bar, moved into the shell `actions` when `sticky`; `config.actions` through `showTitleBar` | n/a | none | `pk-record-*` plus `pk-action` | `OnAction`, `OnRecord*` |
| `pk-sections-page` (`sections-page.js` 29) | `config.actions` (title bar) then the host slot | takes this shape (#2010) | none | `pk-action` | `OnAction` |
| `pk-wizard-page` footer (`wizard-page.js` 67) | `footerActions: [{ key, label, icon? }]`, `collapse=phone` | n/a | phone | `pk-wizard-action` | `OnFooterAction` |

Three loops build buttons (title bar, list toolbar, wizard footer) and no two agree on fields. A consumer who wants "icon-only, label as tooltip, a callback" writes
slot markup per page, and the list cannot take a callback at all.

## 2. Target

**One item shape, used by every list of actions** (title bar `actions`, list `toolbarActions`, `bulkActions`, `newAction`, wizard `footerActions`):

```
{ key, label, icon?, href?, variant?, disabled?, busy?, group?, hint? }
```

- `key` is the callback id. `href` wins (a link, no event). An item with neither is a config error: `warnOnce`, not drawn.
- `hint` is the tooltip text; with no `hint` and an icon-only button the tooltip is the `label`. The accessible name is always the label (the button's own rule).
  Bulk keeps `id` as an alias of `key` and `pk-bulk` as its event (it carries the selection); nothing else changes there.
- `newAction` (same shape) is drawn first, `variant: "primary"` unless set, first in DOM and focus order. On the list it is the toolbar button (title bar when the toolbar is hidden);
  it replaces `addLabel`/`pk-add`, kept one minor as an alias (emits `pk-add` and `pk-action { key: "new" }`).
- `actionsCollapse`: `always | phone | tablet | none`, one value for the whole bar. Default `phone`, so a list with icons behaves as today. An item without an `icon` is never collapsed (`warnOnce`).
  The per-item `collapse` (list today) stays one minor as a deprecated override, then goes.
- `group`: items sharing a `group` string form one menu button (label = the group); items without `group` stay buttons. The menu is a `pk-dropdown`, so keyboard (arrows, Escape returns focus to the trigger),
  rtl and the phone sheet come from the element. Width-based `actionsOverflow` stays the header's (it flattens whatever is in the slot, menus included); icon-only folding is the button's; each item folds once.
- Focus order is DOM order: `newAction`, items in array order, then slotted host actions. One tab stop per button, no roving tabindex. Visual order equals DOM order in ltr and rtl (flex, no `order`).
- Event: one `pk-action { key }` (bubbling, composed) on the page host from every page type including the list and the wizard footer (which keeps `pk-wizard-action` as an alias). Disabled or busy items raise nothing.

**Blazor.** Recommended, the thin-wrapper form: no per-item callback. `Actions`, `NewAction`, `ToolbarActions` are `IReadOnlyList<PkAction>` / `PkAction` (a plain record of the shape, no `EventCallback`),
`ActionsCollapse` is an enum, and the existing `OnAction` receives the key. A callback per item would make the wrapper hold delegates and re-bind them each render (stale-callback logic the wrapper rules forbid)
and cannot cross the JSON attribute. The consumer writes `OnAction="@(e => e.Key switch { "export" => Export(), _ => Task.CompletedTask })"`. A `PkActionMap` (key to delegate, returns the handler) is an
optional consumer-side helper, hand-written only if the owner wants it. `PkAction` is generated from a `shape` entry in the elements' `meta.json` (owner decision 2026-11-12), not hand-written; `ActionsContent` stays for what the shape cannot say.

## 3. Where it lives

- New `core/js/page-actions.js` (about 1.3 KB raw): `renderActions(host, list, { collapse })` returns the nodes (button or link, tooltip, group menu). `showTitleBar` calls it instead of its own loop
  (it loses about 700 B); `list-page.js` `fill()` and the wizard footer call the same function. No new element. Tiers: pages and `js/` modules may name `pk-button`, `pk-tooltip`, `pk-dropdown`;
  `pk-page-header` and `pk-page-shell` gain no new `pk-*` child (C1); no `tier: element` source is touched (C4); `core/tools/tiers.mjs` and the baseline are not edited. Ownership: the host builds light-DOM
  children into the shell it owns, as `showTitleBar` does today; nothing subscribes outside the subtree.
- `pk-page-header` is unchanged: `group` menus are slotted `pk-dropdown`s, which `overflow()` already flattens (#1737).
- Bytes: nothing enters the three reference pages or page-weight pages. The app entry graph (22 KB gz hard cap) is affected only if `page-shell.js` is in it: measure first
  (`node scripts/set-ceilings.mjs --measure`); if it is, the code removed from `showTitleBar`, `list-page.js` and the wizard must pay for the file (net zero or smaller). Core unpacked has about 31 KB headroom
  after the 0.31 carve-out; this adds under 3 KB including mapping data. No ceiling is raised.
- Tests: node unit tests for the pure renderer (shape, errors, order, group); browser cases `core/tests/browser/cases-page-actions.js` at 1280 and 390: icon-only per `actionsCollapse` value and across the 640 breakpoint
  (rect width equals height, accessible name equals label), tooltip present for `always`, `newAction` first in focus order and leftmost (rightmost in rtl), grouped items out of the bar and in the menu in order,
  Escape returns focus to the trigger, disabled and busy raise no `pk-action`, a list callback raises `pk-action`, an `href` item raises nothing. Scenario `page-actions.js` (resize, menu open, focus ring, rtl).
  Blazor: bUnit for the generated parameters; a lab case in `scripts/blazor-browser-lab-cases.mjs` for `OnAction` after a re-render with a changed list.
- Follow-ups: **#1940** is closed and needs nothing more (its `always` is the same value as `actionsCollapse`). **#1956** reduces to: with `toolbarInHeader`, the list renders the same items into the table's
  actions part and `group` menus replace header overflow, so no new `pk-data-table` prop; the sticky toolbar row stays a layout issue against the fill frame.

## 4. Phases (each about 400 lines, `main` releasable)

1. `js/page-actions.js`; `showTitleBar` uses it. Items gain `icon`, `disabled`, `busy`, tooltip from label; `actionsCollapse` and `newAction` on every title-bar page type (tool, settings, dashboard,
   master-detail, workspace, record, sections). Behaviour change: none for existing configs (no icon, no collapse). Browser cases for collapse, order, disabled and busy.
2. List adopts it: the `fill()` loop goes, `toolbarActions`, `newAction` replaces `addLabel`, config actions raise `pk-action` (an href item stays a link). Wizard footer on the renderer. Per-item `collapse` read as a deprecated override.
3. `group` menus, scenario, rtl and phone cases; the record page adds config actions beside its own bar.
4. Blazor: `shape` in `meta.json`, generator emits `PkAction`, `NewAction`, `Actions`, `ToolbarActions`, `ActionsCollapse` on the list, tool, settings, record, sections and master-detail mappings (`"extra": true` where the
   component exists); lab case; docs, gallery samples and skills.
5. #1956 `toolbarInHeader` picks it up; sections-page needs only docs and a test (its config already routes through `showTitleBar`).

Consumers: existing `actions` (`label`, `href`, `key`, `variant`, `hint`), `ActionsContent`, `OnAction`, `pk-add`/`addLabel` and per-item `collapse` keep working; deprecations are changelog notes, removal is a later breaking release.

## 5. Open questions for the owner

1. Callback per item in Blazor (`PkAction.OnClick`)? Recommend no: key plus `OnAction`, with an optional consumer-side `PkActionMap`. A per-item callback breaks the 1:1 wrapper rule and cannot be serialized.
2. Drop the per-item `collapse` after one minor? Recommend yes: one bar-wide value is the consumer's ask and removes the double-fold case.
3. `actionsCollapse` default `phone` (today's list behaviour) or `none`? Recommend `phone`, so existing lists do not change.
4. Remove `addLabel`/`pk-add` at once or after one minor? Recommend after one minor, with `newAction` as the documented route from phase 2.
