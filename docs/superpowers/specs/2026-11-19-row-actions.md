# Row actions: an icon action column on pk-data-table and pk-list-page (#2046)

Status: design only, 2026-11-19. Verified against `origin/integration/next` and PR #2044 (#1943 phase 1, `core/js/page-actions.js`, open). Extends the item shape of
`2026-11-12-page-actions-model.md` and `2026-11-19-page-actions-new-record.md` to rows, which those specs do not cover.

## 1. Today

| Concern | What exists | Where |
|---|---|---|
| Row activation | `clickable` (row click, Enter) or `rowHref`/`rowHrefTemplate`; both raise `pk-row-click { id, row }`; clicks inside `input,button,a,select,label` are ignored | `core/elements/table/table.js` 38, `core/components/data-table/data-table.js` 30, 131 |
| Cell content | slotted `cell-<id>-<key>` children, re-slotted by pk-data-table into the inner pk-table | `data-table.js` 13 |
| Selection and bulk | `selectable`, `selected`, `pk-select`, `BulkContent` slot (free markup, no item shape) | `table.js`, `data-table.meta.json` |
| Cards mode (phone) | `cards`: each row a card, label/value flex rows, `td:empty` hidden, slotted `pk-button` may shrink | `table.css`, 640 px block |
| Hand-rolled icon buttons | consumers slot a `pk-button` per row into a cell slot, listen to its click and look the row up themselves: no name with the row, no collapse, no confirm, no common event; Blazor needs a `RenderFragment` per cell | gallery table samples |
| Item shape and renderer | `{ key, label, icon?, href?, variant?, disabled?, busy?, group?, hint? }`, `renderActions(host, items, { collapse })`, one `pk-action { key }`; an icon item folds to the icon alone at `actionsCollapse` | PR #2044 |
| Confirm | `PkDialog.confirm(options) -> Promise<boolean>` and `dialogs.confirm({ heading, message, confirmLabel, danger, onConfirm })`; a destructive confirm focuses Cancel, the browser returns focus | `core/elements/dialog`, `core/js/dialogs.js` |

Gaps: no data-driven row actions; no accessible name that names the row; no pinned column; no per-row disabled/hidden without callbacks; no single event; no defined
interplay with row activation; destructive actions have no standard confirm step.

## 2. Target

### 2.1 API

`rowActions` on pk-data-table (type `json`, an array of the shared item), forwarded by pk-list-page and the list of pk-master-detail-page. No new item fields except `confirm`.

```js
table.rowActions = [
  { key: 'view',   label: 'View',   icon: 'search' },
  { key: 'edit',   label: 'Edit',   icon: 'edit' },
  { key: 'delete', label: 'Delete', icon: 'trash', variant: 'warn', confirm: { heading: 'Delete {title}?', message: 'This cannot be undone.' } },
];
```

- **Event.** One `pk-action` per press from the pk-data-table host: `detail = { key, id, row }`. Same name as the page-bar event; the page-level `{ key }` is a subset, so a
  listener reading only `key` keeps working. The row event bubbles, so a page listener tells them apart by `detail.id !== undefined` (documented; pk-list-page re-emits nothing).
  `pk-row-click` is unchanged.
- **Per-row state, data-driven (safe for the thin Blazor wrapper).** A row may carry a reserved field `_actions`: an object keyed by action key,
  `{ disabled?, hidden?, hint? }` (for example `{ delete: { disabled: true, hint: 'Posted orders cannot be deleted' } }`). No callback, no per-item function: Blazor sends the same JSON.
  Rejected: `rowActionState(row)` callbacks (the wrapper cannot carry them) and a full per-row action list (repeats labels and icons in every row).
- **Confirm.** An item with `confirm: true | { heading?, message?, confirmLabel? }` calls the existing `dialogs.confirm({ danger: true })` first; `pk-action` fires only when it resolves
  true. `variant: 'warn'` confirms by default (safe), `confirm: false` opts out. `{title}` in heading and message reads the row title. No new dialog.
- **Name, tooltip.** The control is an icon `pk-button` (label = native tooltip, pk-button's rule). Its accessible name is `"<label> <row title>"` ("Edit Order 1042") through
  `aria-label`; the row title is the column marked `title` (the card-heading column, #1445), else the first text column, else the row id. `hint` is the tooltip text (the `pk-tooltip` path of #2044).

### 2.2 Layout and responsive behaviour

- A synthetic last column, header text "Actions" visually hidden (the `th` stays for screen readers), pinned at the inline end (`position: sticky; inset-inline-end: 0`, the existing
  sticky-column pattern mirrored), opaque `--color-panel`, always visible (not hover-only: touch). Not sortable, resizable, reorderable or exported. Logical properties only, so rtl puts it at the left.
- **Collapse into a row menu** (one `pk-dropdown`, trigger an icon button named "More actions for Order 1042") when more than three actions are visible (`rowActionsMax`, default 3),
  when an item has a `group`, or when the table is tight (container under 36 rem, the existing `@container` shed breakpoints). Menu items carry icon and label.
  Owner's form-factor rule: phone icons only, medium icons where tight, large icon plus visible text only with `rowActionsLabels` (default off: icon plus tooltip, the usual admin pattern).
- **Cards mode (phone).** The action cell becomes the card footer: full width, `justify-content: flex-end`, no `data-label`, 44 px (`--touch-target`) buttons, a hairline above. It is never
  dropped by `td:empty`. The card stays activatable by `clickable`; the footer buttons do not activate it (the table already ignores clicks in buttons).
- **Print.** The column is `display: none` in `@media print` (an action is not data).
- **Sticky column.** Coexists with `stickyColumn` (first column sticks at the start, actions at the end); the opaque background suffices, no edge shadow in v1.

### 2.3 Interplay

- **rowHref / clickable.** Both keep working. Recommendation: activation stays the primary "open", and `view` is not duplicated unless the consumer wants a preview. The actions cell is
  excluded from activation. SKILL guidance: a `view` action or `rowHref`, not both, except where they differ.
- **selectable.** Checkbox column at the inline start, actions at the end; bulk actions keep their own bar and move to the shared item shape in a later phase. Per-row actions stay enabled while rows are selected (consumers disable through `_actions`).
- **Sorting, paging, filters.** Unaffected; the column is not data. Empty and loading rows span it.
- **Keyboard.** Sequential Tab order, row by row, buttons in DOM order. No roving tabindex (pk-table is not a grid; 25 rows cost 75 stops, accepted, and the table's scroll region stays focusable).
  After a confirmed delete the dialog's focus return points at a removed button, so pk-data-table restores focus after its reload: the next row's first action, else the previous row's, else the table.

## 3. Where it lives

**Recommendation: pk-data-table owns it; pk-table stays presentational.** pk-data-table owns the row model and already fills pk-table's cell slots; the action cell is one more slot,
`cell-<id>-_actions`, filled with nodes from the shared renderer. pk-table gets only two content-agnostic layout things: a column flag `pinEnd` (sticky at the inline end, reusing the
sticky-column CSS) and the cards-mode footer styling for a column `kind: 'actions'`, about 120 B gzip of CSS. The alternative, a generic `actions` column type inside pk-table, is rejected:
pk-table is tier `element` (C4: no `pk-*` rendered, base HTML only), while buttons, a dropdown and a dialog are `pk-*`, and the event, confirm and per-row state are application logic.

**Budgets.** pk-data-table is at 4096/4096 B gzip, so the logic is a lazy part, `core/js/row-actions.js`, imported only when `rowActions` is non-empty (like `table-expand.js`): builds the cells with
`renderActions` (`core/js/page-actions.js`), merges `_actions`, builds names and tooltips, picks collapse, runs confirm, restores focus. Estimate 1.2 to 1.6 KB gzip, in no entry graph that does not use it:
the app entry cap (22 KB) is untouched and page-weight pages never import it. The element itself grows by about 60 B (a prop and the dynamic import); an equal amount of existing code moves into
a lazy part before merge, so no ceiling is raised. Core unpacked impact about 2.5 KB of the 30 KB headroom. Tiers: pk-data-table is a component and may use pk-button, pk-dropdown, pk-tooltip (lower tiers); the lazy part is a plain module.

**Tests.** Node: item normalisation (`_actions` merge, hidden, disabled, title fallback, token substitution), name building, `rowActionsMax` collapse choice, confirm gate (stubbed dialogs), event detail.
Browser cases (measuring): column at the inline end in ltr and rtl (rect against the table edge); icon-only 44 px targets at 390; every button name contains its row title; one `pk-action` with
`{ key, id, row }` per press and none when confirm is cancelled; menu collapse above 3 and when tight; disabled and hidden rows; Tab order row by row; focus after delete; the actions cell never raises
`pk-row-click`; cards-mode footer. Scenario `row-actions` (`core/tests/review/scenarios/`): three icons, menu open, delete confirm open, phone cards, rtl; every screenshot opened.

**Docs and skills.** Gallery: a "Row actions" example on the data-table and list-page pages (orders with view, edit, delete; one row with delete disabled and a hint); table guidance in docs;
`scripts/skills/` workflow text in the existing table file (SKILL.md is at its 250-line cap: replace a line, do not add). Blazor: `blazor/mappings/data-table.json` and `list-page.json` get `RowActions`
(list of an action record from `meta.json`), `RowActionsMax`, `RowActionsLabels`, `OnRowAction` (key, id, row) as `extra` mappings so hand-written files do not grow; no `RenderFragment`, no per-item callback.

## 4. Phases (each about 400 lines, `main` stays releasable)

1. **After #1943 phase 1 (#2044) merges.** `core/js/row-actions.js`, `rowActions` and `pk-action` on pk-data-table, `pinEnd` and actions kind in pk-table, `_actions`, names, tooltips, menu collapse,
   confirm and focus return (delete without them is unsafe), node and browser tests, Blazor mapping, changelog `added`.
2. **Phones and polish.** Cards footer, rtl and tight refinements, `rowActionsLabels`, the scenario and screenshots, pk-list-page forwarding, gallery, SKILL and docs.
3. **Alignment with #1943 phases 2 to 5.** Row actions need only phase 1, so they can run in parallel; the list toolbar (phase 2) and bulk bar adopt the same renderer, and review compares button style
   (icon, tooltip, collapse) so it is identical. Only the row-versus-page event note is added to docs.

**Migration.** Nothing breaks: slotted cell buttons, `clickable` and `rowHref` work as today. The SKILL tells agents to prefer `rowActions` for per-row commands and keep a slotted cell for custom content only.

## 5. Questions only the owner can answer

1. **Icons with tooltip, or visible labels at large?** Recommendation: icon plus tooltip by default, `rowActionsLabels` opts into text; confirm rows are an exception to "large = icon + text".
2. **Collapse threshold.** Recommendation: more than 3 visible actions, or any `group`, becomes a menu.
3. **Implicit confirm for `variant: 'warn'`.** Recommendation: yes, `confirm: false` opts out.
4. **`view` plus `rowHref`.** Recommendation: allow both, document the choice, never auto-hide the magnifier.
