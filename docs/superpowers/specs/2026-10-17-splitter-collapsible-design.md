# pk-splitter: collapsible, persisted end pane (refs #1523, #336)

Status: proposal for owner decision. Research and design only; no product code.

## 1. Evidence on main

- `pk-splitter` (tier `element`, `core/elements/splitter/`, js 3.7 KB, css 2.4 KB): two panes (slots `start`, `end`) and a separator handle (pointer drag, arrow keys via `js/size.js`, shared with the gallery inspector). Props `orientation`, `size` (percent for the start pane, bound to `pk-resize`), `min`, `max`, `step`, `label`, `disabled`; events `input` while dragging, `pk-resize` on commit; parts `root`, `start`, `handle`, `end`. Blazor: `blazor/mappings/splitter.json`, `Size` two-way bound to `pk-resize`.
- Consumers: `pk-dock` (every split; it has its own header-collapse and collapse-to-rail model in `js/dock-model.js` and persistence via `persistKey` + `createStore` from `js/store.js`); the code explorer's panes; the gallery inspector drawer (uses only the `js/size.js` engine, pinned in `core/tools/composition.allow.json` until #391). The gap: any app wanting a side panel that hides and remembers its width hand-rolls collapse and storage.
- Precedent for persistence: `pk-dock` `persistKey` (versioned, validated store); `core/js/mount-support.js` helpers never throw on write.

## 2. Collapse control

- New booleans `collapsible` (shows the control, enables keys) and `collapsed` (state, host-owned). Only the `end` pane collapses in v1 (inspector, detail, console panels). A start-side collapse is deferred; app sidebars are shell/nav territory.
- Control: a native `<button part="toggle">` on the handle line (chevron drawn in CSS/SVG, flipped for orientation and RTL), `aria-expanded`, `aria-controls` the end pane, name from `toggle-label` (default "Collapse panel" / "Expand panel"). Tier `element` may not render `pk-button`, so a native button is used as in `pk-code-block`.
- Keyboard on the handle: Enter or Space toggles (WAI-ARIA window splitter pattern); arrows, Home, End keep their meaning. Double-click on the handle also toggles (VS Code sash, Split.js convention).
- Event `pk-collapse-change { collapsed }` on user action only; a programmatic attribute change fires nothing. Not cancelable, like `pk-resize`.
- No "drag past min to collapse" in v1 (surprising on touch, hard to restore).

## 3. Collapsed look

The end track becomes 0; the end pane is `inert` (not focusable, out of the accessibility tree) but its light DOM is untouched, so consumer state survives. The handle stays as a thin rail with the toggle visible, so restoring is always possible. The track change uses `--duration-*` tokens and is off under `prefers-reduced-motion`. `size` is never overwritten by collapsing, so expand restores the exact prior width.

## 4. Persistence

Recommendation: host-owned contract, plus an opt-in convenience reusing the existing store.

- Contract, no storage inside: `size` and `collapsed` are attributes; `pk-resize` and `pk-collapse-change` report changes. A host (or Blazor `@bind`) can persist anywhere (URL, server, user settings).
- Convenience `persist-key` (default empty), the same shape as `pk-dock` `persistKey`: read `{ size, collapsed }` via `createStore({ prefix: 'pk-splitter:<key>' })` on first connect only when the host set neither attribute; write on `pk-resize` and `pk-collapse-change` (commit, never per pointer move). Storage failure goes to `this.warnOnce`, never thrown, no empty catch. Stored `size` is re-clamped to the current `min`/`max`.
- Persisted: `size` (percent, the attribute's unit; pixels differ by device) and `collapsed`. Not persisted: orientation, limits, scroll.
- Cost: `js/store.js` is imported lazily only when `persist-key` is set, so plain splitters pay nothing.

## 5. Phone behaviour

A side-by-side content split is rarely usable at `--phone`. With `collapsible` and a horizontal split the end pane starts collapsed (unless the host set `collapsed` explicitly or a stored value exists); the toggle becomes a 44px target, icon only (aria name kept); expanding shows the end pane as a full-width stacked row below the start pane instead of a narrow column. Without `collapsible` nothing changes (the handle is already touch-sized). Phone-derived defaults are never written to storage.

## 6. Tier and size

- Stays tier `element` (native toggle, no `pk-*` rendered, C4); `pk-dock` (component) keeps using it (C1).
- Growth estimate about 0.6 KB gz js and 0.3 KB gz css; the persistence glue can live in a lazy `core/js/splitter-persist.js` if the element's budget is tight. Budgets are never raised.
- The dock must not regress: it does not set `collapsible`; `cases-dock.js` passes unchanged.

## 7. Blazor

`splitter.json` gains `Collapsible`, `Collapsed` (two-way via `pk-collapse-change` `detail.collapsed`, as `Size` binds `pk-resize`), `PersistKey`, `ToggleLabel`. Generator only.

## 8. Accessibility

- Handle keeps `role="separator"`, `aria-valuenow`, orientation; adds `aria-controls`; `aria-valuenow` is 0 while collapsed (APG window splitter). Toggle has `aria-expanded`.
- Toggle is a Tab stop, named, with a focus ring token and a coarse-pointer target; if focus was inside the collapsing pane it moves to the toggle. RTL flips the chevron; reduced motion respected; state is conveyed by `aria-expanded`, no extra live region.

## 9. Tests

- Node (`splitter.test.mjs`): collapse sets track 0 and `inert`; `size` untouched; Enter/Space/double-click toggle and fire the event; `persist-key` restores and clamps, store failure logged not thrown, host attributes win.
- Browser cases (rect comparisons): collapsed end pane has zero width and start fills; expand returns the exact prior size; RTL; phone 375 default collapsed and stacked when expanded.
- Scenario `core/tests/review/scenarios/` for splitter: collapsed, expanded, toggle focus ring, RTL, phone, light and dark.
- Dock cases, `tiers.test.mjs`, `ownership.test.mjs` unchanged and green.

## 10. PR-sized steps

1. `collapsible`/`collapsed`, toggle, keys, event, CSS, tests (about 250 lines).
2. `persist-key` with lazy store, tests (about 120 lines).
3. Phone behaviour, scenario, browser cases (about 120 lines).
4. Blazor mapping, docs, gallery sample; then a separate consumer PR (gallery inspector, closing the #391 allow-list pin, if still wanted).

## 11. Decisions for the owner

1. End pane only in v1; `collapsible` + `collapsed`, native toggle on the handle, Enter/Space/double-click, event `pk-collapse-change`: recommended yes.
2. Persistence host-owned by attribute and event, plus opt-in `persist-key` on `createStore` (as `pk-dock`): recommended yes.
3. Persist `size` (percent) and `collapsed` only: recommended yes.
4. Phone: collapsed by default when `collapsible`, expands as a stacked row: recommended yes.
5. Stay tier `element`: recommended yes.
