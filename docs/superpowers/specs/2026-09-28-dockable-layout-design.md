# Dockable workspace layout: a dock-tree model, a thin `pk-dock` element

Status: proposed design for owner review, not yet planned or implemented. Refs #432 (standing tracker #336, app framework #346).

## Why

Issue #432 asks for a desktop-style dockable interface: dockable panels (Toolbox | Canvas | Properties), resize handles, collapsible panels,
floating panels and a layout that persists. Today the SDK has the parts but not the whole:

- `pk-workspace` is a fixed three-slot layout (`nav`, `main`, `aside`); which pane is where is markup, not data, and nothing moves.
- `pk-splitter` resizes exactly **two** panes by a percentage (`size`, `min`, `max`, `pk-resize`); it has no collapsed state and no memory.
- `pk-drawer` `docked` mode pins one panel to an edge; it is one panel, not a system.
- `pk-tabs` is a strip with panels, no drag between strips. `pk-sortable` reorders items and accepts an item dragged in from another list
  (`accept-external`, `externalDragOver`/`endExternalDrag`), which is the drag machinery a tab strip needs.
- The `workspace` page type (`pk-workspace-page`, #467) declares `panes: ['nav','aside']` and a `mount(panes)` callback. It is the consumer of a dock
  layout, not a competitor of it.

The layout builder (`js/layout-model.js`, `js/layout-builder-logic.js`, `modules/layout-builder`) already proves the pattern the SDK likes: a **pure,
node-tested tree model** (`insertNode`, `moveNode`, `removeNode`, `wrapNode`, `validateDoc`, `fromJson` that sanitises untrusted input,
`createHistory` for undo) with a thin DOM layer on top and keyboard alternatives to pointer moves. A dock layout is the same kind of thing: a tree of
split nodes, tab groups and panels, edited by move operations. So the work is mostly a small model plus one thin element, not a new engine.

Answer to the question in the issue ("extend pk-workspace / pk-drawer or a separate element?"): a **new thin `pk-dock`** that *composes* `pk-splitter` and
`pk-tabs`; `pk-workspace` stays the simple fixed layout (and the phone tab-strip precedent), `pk-drawer` stays the modal overlay. Neither is stretched
into something it is not.

## Non-goals

- No new pane primitive for two-way resizing: `pk-splitter` is reused as is (binary). No change to `pk-splitter`'s existing props.
- No multi-window / pop-out into a browser window, no native drag-out of the page. "Floating" means inside the `pk-dock` bounds.
- No general window manager (no overlapping-window z-order beyond "the last touched floater is on top", no snapping to other floaters, no minimise to a taskbar).
- No new `pk-widget`-style duplicate of `pk-card`; panel chrome is `pk-card`-shaped (see "Panel chrome").
- No dependency on the layout builder module: the dock model shares its *shape of solution* (pure ops + history + validation), and imports only
  what is genuinely generic (`createHistory`, the store), see "Reuse".
- Not a page type replacement: `workspace` keeps its config; a later step lets it opt into `dock`, it does not change shape.
- No server-side or cross-device layout sync. Persistence is the existing local store.

## Reuse: what exists and how it is used

| Need | Existing thing | Use |
| --- | --- | --- |
| Resizable split | `pk-splitter` (binary, `size`/`min`/`max`/`step`, `pk-resize`, keyboard, RTL) | one per binary split node; its keyboard resize is the accessible resize |
| Tab group | `pk-tabs` + `pk-tab` + `pk-tab-panel` | one per tab-group node |
| Drag a tab to another group / reorder | `pk-sortable` `accept-external`, `pk-sortable-item` | tab strips are sortables, so tab reorder and cross-group drag are inherited |
| Panel chrome (title, actions, collapse) | `pk-card` (heading, actions, footer), `pk-accordion-item` for the collapse semantics | header of every panel |
| Undo / redo | `createHistory` (`js/layout-model.js`) | reused verbatim: the model's document is immutable, ops return the next document |
| Versioned, validated persistence | `createStore` (`js/store.js`): `{ v, data }` envelope, migrate, validate, defaults with one warning, 64 KB cap | the layout is one persisted key; the dock model adds structural validation on top |
| Phone | `mediaBelow('phone')` (`js/breakpoints.js`), the `pk-workspace` strip precedent, `pk-drawer` side/bottom | see "Phone" |
| Menus | `pk-dropdown`, `pk-context-menu`, `pk-menu-item` | panel menu = the mandatory non-drag alternative |
| Announcements | `createPage`/live region used by the app shell | dock-tree ops announce their outcome |

Generic pieces that should bubble up rather than live only in `pk-dock`: (1) `createHistory` moves out of `layout-model.js` into its own tiny
`js/history-stack.js` (a pure re-export keeps the layout builder untouched); (2) a `js/tree-ops.js` for the two generic operations both models
need (immutable path-based `replaceAt`/`removeAt` on a JSON tree with id lookup). Both are optional refactors listed as separate small steps; if the
owner prefers, the dock model duplicates ~30 lines first and the extraction happens when a third user appears. See open question 1.

## 1. The dock-tree model (`js/dock-model.js`, pure, no DOM, no logging)

### Shape

A layout is `{ version, seq, root, floating, collapsed }`.

```js
{
  version: 1,
  seq: 9,                                  // id counter, ids "d<number>" never reused (same rule as layout-model)
  root: { id: 'd1', type: 'split', orientation: 'horizontal', size: 20, min: 10, max: 60,
          a: { id: 'd2', type: 'tabs', active: 'tools', panels: ['tools', 'assets'] },
          b: { id: 'd3', type: 'split', orientation: 'horizontal', size: 75,
               a: { id: 'd4', type: 'tabs', active: 'canvas', panels: ['canvas'] },
               b: { id: 'd5', type: 'tabs', active: 'props', panels: ['props'] } } },
  floating: [ { id: 'd6', x: 24, y: 40, w: 320, h: 240, z: 1, group: { type: 'tabs', active: 'log', panels: ['log'] } } ],
  collapsed: ['assets']                    // panel ids folded to their header (or to a rail icon), never a node
}
```

- **Node types:** `split` (binary: `a`, `b`, `orientation`, `size` percent, optional `min`/`max`, exactly the props of `pk-splitter`, so the mapping
  to the element is 1:1), `tabs` (an ordered list of panel ids and the `active` one). A *panel* is **not** a node in the tree: it is a declared item
  (`{ id, title, ... }`, see the API) referenced by id from exactly one `tabs` group, in `root` or in one floater. This keeps the layout pure
  data with no content, so it serialises small and a panel's content can come from the DOM or a callback.
- **Binary splits** (not n-ary) because `pk-splitter` is binary; three columns are `split(a, split(b, c))`. The model normalises so a UI never sees
  an equivalent-but-different shape after an edit.
- `size` is the start pane's percent like `pk-splitter`; the model clamps with the same `clampSize` (imported from `elements/splitter/splitter.js`,
  which already exports it pure; no copy).

### Operations (each returns `{ doc, problems }`, never mutates, never throws on data)

| Operation | Effect |
| --- | --- |
| `dockPanel(doc, { panel, target, zone })` | move `panel` next to/into `target` group. `zone`: `center` (join the group's tabs, becomes active), `left`/`right`/`top`/`bottom` (split the target: the group becomes `split(new tabs, target)` or `split(target, new tabs)`, orientation from the zone, size 50 unless the ratio hint says otherwise) |
| `dockRoot(doc, { panel, edge })` | dock to an outer edge of the whole layout (a new root split) |
| `floatPanel(doc, { panel, rect })` | take a panel out of its group into a new floater; the group it left may collapse away (below) |
| `dockFloating(doc, { floater, target, zone })` | as `dockPanel` for a whole floater group |
| `moveTab(doc, { panel, group, index })` | reorder within or move between tab groups (the keyboard/menu form of tab drag) |
| `activate(doc, { group, panel })` | set the group's active panel |
| `resize(doc, { split, size })` | set a split's size, clamped |
| `collapsePanel` / `expandPanel(doc, { panel })` | toggle membership of `collapsed` |
| `closePanel(doc, { panel })` | remove from its group and from `collapsed`; the panel stays *declared*, so a "Panels" menu can bring it back with `openPanel` |
| `openPanel(doc, { panel, near? })` | put a closed panel back: next to its last neighbour when remembered, else the default group; never fails just because the old spot is gone |
| `moveFloater` / `resizeFloater` / `raiseFloater(doc, { floater, ... })` | rect and z change; rect clamped to the dock bounds passed in (`{ w, h }`), min size |
| `resetLayout(doc, defaults)` | back to the consumer's default layout |

### Invariants (the property tests assert them after every operation and after `fromJson`)

1. **Every declared, open panel appears in exactly one `tabs` group** (in `root` or one floater); no panel twice; no unknown panel id.
2. **No empty group.** A `tabs` group that loses its last panel is removed and its parent `split` is replaced by the surviving sibling (the normal
   "collapse the hole" rule); if the last group in `root` empties, `root` is `null` and the element shows its empty state (a `pk-empty-state`).
3. `active` is always a member of its group's `panels`.
4. `size` is finite and inside `[min, max]` (default 5 to 95); `min <= max`.
5. Ids are unique across `root` and `floating`; `seq` is greater than every id.
6. Depth and node counts are capped (`LIMITS = { depth: 12, groups: 64, floaters: 16, panels: 128 }`); an operation that would exceed a limit returns a
   `problem` and the unchanged document.
7. A floater rect has positive finite size and is inside the bounds when bounds are given (clamped, not rejected).
8. `collapsed` only lists open panels, without duplicates.
9. Operations are **total**: any request (unknown id, dock a panel onto itself, dock a group into its own subtree) returns the input unchanged plus a
   `problem { code, severity, message, path }` (same problem shape as layout-model), never an exception.
10. `toJson`/`fromJson` round-trip: `fromJson(toJson(doc))` equals `doc`; `fromJson` of anything (property-tested with random and hostile input)
    returns a document that passes 1 to 9.

### Serialisation and untrusted data

`toJson(doc)` writes the shape above. `fromJson(input, { panels })` is the one door for stored, imported or shared data: parse in try/catch,
size cap (the store's 64 KB), `version` check (older: `migrate(doc, fromVersion)` chain in the model file; newer or unknown: default), then a
structural validator that **rebuilds** the tree from known fields only (unknown keys dropped, numbers clamped, wrong types replaced), drops references
to panels that are not declared now (a panel removed in a release), and appends panels that are declared but absent (a panel added in a release)
to the group named by their `defaultGroup` hint. Result is `{ doc, problems }`; problems are warnings the element logs once with `this.warnOnce`.
Nothing is ever evaluated or turned into markup (panel titles come from declarations, not from stored data).

### Undo

`createHistory(layout)` gives undo/redo of every structural operation. Drag-resize and floater move coalesce with the history `key` argument that
already exists (`push(next, 'resize:d1')`), so one drag is one undo step. Undo is also an accessibility feature: a mistaken drop is one keystroke away.

## 2. The `pk-dock` element (thin)

The element only (a) holds a `layout`, (b) renders it, (c) turns user input into model operations and raises events. It has no layout logic of its own.

### Rendering (shadow tree owned by the element, host owns light DOM)

Per the ownership rules (`core/STANDARDS.md`, "Ownership and reactivity"): the host owns its attributes and its light-DOM children, the element owns its
shadow tree. Panel contents are **light-DOM children** and are *slotted* into the shadow tree; the element never moves, wraps or reorders the
consumer's nodes. Each declared panel `<pk-dock-panel panel-id="canvas" heading="Canvas">` gets a slot name `p-canvas`; the shadow tree contains
one `<slot name="p-canvas">` inside whichever `pk-tab-panel`/panel box currently shows it. Moving a panel between groups changes only which shadow
container holds the `<slot>`, so the consumer's DOM (form state, scroll positions inside it, focus, an engine mounted in it) survives a dock
move. This is the one design decision that makes docking cheap for content that has state; see open question 2 for the cost (slot reassignment
does not reset iframes or media, but `pk-tabs` panels that hide with `hidden` still keep state).

Rendering is a straight walk of the tree:

- `split` becomes `pk-splitter` (orientation, size, min, max) with the two child renders in its `start`/`end` slots. `pk-resize` calls
  `resize` on the model.
- `tabs` becomes `pk-tabs` whose `pk-tab` strip is a `pk-sortable` for reorder and cross-group drop (`accept-external`), plus a trailing
  overflow button for the panel menu. A group with a single panel renders as a titled panel (no tab strip) using the panel chrome.
- `floating` becomes an absolutely positioned layer above the docked tree; each floater is a `tabs` group with a titled frame and a resize corner.
- Reconciliation: keyed by node id, so a small model change patches the affected splitter/tabs and does not rebuild the tree (see "Performance").

### Panel chrome

Each panel has a header: title, an actions area (slot `actions` inside the panel declaration), a collapse chevron, and a "more" menu button. It is built
from `pk-card`-shaped parts and `pk-accordion-item` semantics (a button that toggles `aria-expanded` on the region it controls) rather than a new look;
`--pk-dock-*` hooks only override spacing and the header height. A collapsed panel in a vertical stack shows its header only. A collapsed panel in a
docked column at a screen edge folds to a **rail** (an icon strip: `icon` from the declaration) with the panel as a flyout on click, the
familiar IDE behaviour; that flyout is the same panel element, shown over the content, and is open question 5.

### Drag to dock (pointer)

- Grab a tab (or a panel header, or a floater frame) with the pointer. The element enters a drag session with `pk-sortable`'s pointer machinery for
  tab reorder and its own `pointermove` handling for dock targeting.
- **Drop zones:** while dragging over a group, an overlay shows five zones (centre and four edge quarter zones); over the dock edge, four outer edge
  zones. The zone under the pointer is highlighted with an outline (tokens: `--color-accent`, `--radius-*`, no motion beyond a `--duration-fast`
  opacity fade, none under `prefers-reduced-motion`). Releasing applies `dockPanel`/`dockRoot`/`floatPanel` (outside all zones = float at the pointer).
- Escape cancels the drag and restores the pre-drag document.
- The overlay is a single absolutely positioned element in the shadow tree, moved and resized by the drag, not one element per group (cheap).

### The accessible non-drag alternative (mandatory)

Everything drag can do has a keyboard and a menu path; drag is an enhancement, never the only way (WCAG 2.5.7 Dragging Movements).

- **Panel menu** (button in every panel header and tab, also `Shift+F10`/context menu key on the tab): `Move to...` (a sub-menu of "Dock left of
  <panel>", "Dock right of", "Dock above", "Dock below", "Add as tab in", each naming a real group by its active panel's title), `Float`, `Dock back`,
  `Collapse`/`Expand`, `Close`, and a global `Panels` menu on the dock toolbar to reopen closed panels and `Reset layout`. Built from `pk-dropdown` and
  `pk-menu-item`; no new menu.
- **Keyboard on a focused tab or panel header:**
  `Alt+Shift+ArrowLeft/Right` reorder within the group (same idea as `pk-sortable`'s `Alt+Up/Down`), `Alt+Shift+ArrowUp/Down` move the panel to the
  neighbouring group in that direction as a tab (the move target group is announced), `Ctrl+Alt+F` float, `Enter` on the chevron collapses,
  `Delete`/`Ctrl+W` closes (with the `pk-dock-close` event cancelable so a consumer can veto an unsaved panel). The exact chords are open question 6.
- **Resize** is the splitter's own keyboard (arrows, Home, End, `role="separator"` with `aria-valuenow`). Floaters resize and move with
  `Alt+Arrow` (move) and `Alt+Shift+Arrow` (resize) when the floater frame has focus, step 16 px, `Shift` for 64 px.
- **Undo/redo** `Ctrl+Z` / `Ctrl+Shift+Z` while focus is inside the dock (only when the consumer opts in with `undo`; the shell may own those keys).
- Every operation announces through one polite live region: "Canvas docked to the right of Properties", "Log floated", "Assets collapsed".
- Focus after an operation goes to the moved panel's tab (or, after close, to the neighbouring tab, or the dock toolbar's Panels button when none).

## 3. Floating panels

Floaters are model data (`floating[]`), rendered as an overlay layer inside `pk-dock` (`position: absolute` in the dock's containing block, `z-index` from
`z`, not `position: fixed`, so a floater never escapes its dock or the app shell's scroll region and needs no popover or top layer). A floater has a
frame (title bar to drag, buttons: dock back, close), a resize handle (bottom-right, plus the keyboard alternative above) and is a real `role="dialog"`-free
`role="group"` with `aria-label` = the panel title (it is not modal: no focus trap, no backdrop; Tab flows through the dock in DOM order with the floater
placed after the docked tree so reading order is stable). Dragging a floater's title near the dock edge or over a group shows the same drop zones.
Rects are stored as numbers relative to the dock box and clamped on load and when the dock resizes, so a saved layout from a larger monitor never leaves
a floater off screen. Under the phone breakpoint floaters do not exist (see "Phone").

## 4. Public API sketch

```html
<pk-dock id="ide" persist-key="ide.layout" label="Editor workspace">
  <pk-dock-panel panel-id="tools"  heading="Toolbox"    icon="wrench"  default-group="left">...</pk-dock-panel>
  <pk-dock-panel panel-id="canvas" heading="Canvas"     closable="false" default-group="center">...</pk-dock-panel>
  <pk-dock-panel panel-id="props"  heading="Properties" icon="sliders" default-group="right">
    <pk-button slot="actions" ...>Reset</pk-button>
    ...
  </pk-dock-panel>
</pk-dock>
```

**How panels are declared: light-DOM `pk-dock-panel` children (declarative, works in HTML, Blazor and the layout builder) plus an optional
`layout` property for the arrangement.** Declaring panels as children is preferred over a config array because content is markup; a config-only form
would force every consumer to create nodes in script and would make the accessible name and content SEO/no-JS hostile. The *arrangement* (which group,
where, sizes) is data (`layout`), and a default arrangement can be derived from `default-group` / `default-size` hints on the panels so a consumer
with no saved layout writes no JSON.

### `pk-dock` props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `layout` | object (property) | derived from panel hints | the layout document (section 1). Setting it validates through `fromJson`; the host owns it, `pk-layout-change` raises the next one (the `commit` pattern of `pk-splitter.size`) |
| `persistKey` (`persist-key`) | string | `""` | when set, the element saves and restores the layout under this store key (below); empty = the host owns persistence |
| `label` | string | `""` | accessible name of the region |
| `floating` | boolean | true | floating panels allowed; false hides Float from menus and disables the layer |
| `dragDock` | boolean | true | drag-to-dock enabled; the menu/keyboard path is always on |
| `undo` | boolean | false | `Ctrl+Z` handling and `undo()`/`redo()` methods active |
| `phone` | enum `auto|tabs|drawers` | `auto` | phone strategy override (below) |
| `fill` | boolean | false | fills its containing block, like `pk-workspace` `fill` |

### Events (custom events, all `pk-` prefixed, all bubbling and composed)

| Event | Detail | Cancelable | Raised |
| --- | --- | --- | --- |
| `pk-layout-change` | `{ layout, reason }` (`reason`: `dock`, `float`, `resize`, `collapse`, `close`, `open`, `reorder`, `reset`, `undo`) | no | after any change is applied (resize: on release, like `pk-resize`) |
| `pk-panel-dock` / `pk-panel-float` | `{ panel, target, zone }` / `{ panel, rect }` | yes | before applying, so a consumer can veto |
| `pk-panel-close` | `{ panel }` | yes | before closing |
| `pk-panel-collapse` | `{ panel, collapsed }` | no | after |
| `pk-panel-active` | `{ group, panel }` | no | a tab was chosen |

### Methods

`getLayout()`, `setLayout(json)` (validates, returns problems), `resetLayout()`, `openPanel(id)`, `closePanel(id)`, `floatPanel(id, rect?)`,
`dockPanel(id, { target, zone })`, `collapsePanel(id)`, `undo()`, `redo()`. Each is a thin call into the model and raises the same events.

### `pk-dock-panel` (light-DOM child; a plain custom element, mostly a declaration)

`panelId` (required, unique, `[a-z][\w-]{0,39}`), `heading`, `icon`, `closable` (default true), `collapsible` (default true), `defaultGroup` (`left|right|top|bottom|center|<panel-id>`),
`defaultSize` (percent), `minSize`, `open` (default true: false starts it closed), `float` (start floating). Slots: default (content), `actions`.
The declaration changes are observed (`watchSlot` like `pk-workspace`): a panel added later is opened in its default group; a panel removed is dropped from the layout.

### Slots on `pk-dock`

Default: the `pk-dock-panel` children. `toolbar` (a strip above the dock for the Panels menu and consumer actions), `empty` (shown when no panel is open).

### CSS hooks

`--pk-dock-header-height`, `--pk-dock-tab-gap`, `--pk-dock-floater-shadow` (defaults to the `--shadow-*` token), `--pk-dock-drop-outline`,
`--pk-dock-rail-width`, `--pk-dock-gap`; parts: `root`, `toolbar`, `group`, `header`, `floater`, `rail`, `drop-zone`. Tokens only, no literal colours.

## 5. Persistence and restore

- The layout is **one persisted key** through `createStore`: the consumer's store module (or `pk-dock` itself when `persist-key` is set, using a private
  module id derived from the key) declares `{ version: 1, defaults: { layout: <default doc> }, persist: ['layout'] }`. The store already gives the
  `{ v, data }` envelope, migration hook, the 64 KB cap, unknown-key and wrong-type rejection and the "one warning, defaults used" behaviour.
- The store validates *type* (object) and size; the **dock model validates structure** (`fromJson`, invariants above) before the element ever renders a
  restored layout, and the two are complementary: a stored layout that passes the store but names a removed panel is repaired by `fromJson`, not
  rejected wholesale, so an upgrade never resets a user's arrangement because one panel disappeared.
- Writes are debounced (about 300 ms) and always flushed on `pagehide`; resize and floater move save on release. Storage blocked: the layout lives in
  memory, warned once (existing store behaviour).
- `layout.version` is the *layout schema*; the store `version` is the *envelope*. Upgrades add a `migrate(doc, from)` step in `dock-model.js` with a test per
  version, so an old saved layout is upgraded, not discarded.
- Multiple named layouts (Design / Debug presets) are an app concern: a consumer keeps several layouts and calls `setLayout`; the model offers
  `resetLayout(defaults)` and nothing more. Out of scope for the first cut (open question 7).
- Cross-tab sync uses `syncTabs` from `store-extras.js` only if the consumer opts in; it is validated like any read.
- Restore before first paint: `pk-dock` reads the stored layout in `connected()` and renders once (no flash of the default arrangement); a
  `pk-layout-change` is not raised for the restore.

## 6. Phone behaviour

Below the `phone` breakpoint (`mediaBelow('phone')`, 640 px) a splitter tree is unusable (two 375 px columns cannot each show a real panel) and a
floating window is worse. Rules, following `pk-workspace`'s existing phone strip:

- **Docked tree flattens to a tab strip** of all open panels (one tab per panel in tree reading order), one panel visible at a time, using the same
  arrow/Home/End roving tabindex as `pk-workspace`'s strip. The *layout document is untouched*: phone is a rendering of the same model, so rotating a
  tablet or resizing a window loses nothing and no state is written by a phone render.
- **Floaters** are shown as tabs too (last), not as windows. Docking and floating operations are hidden on phone; the menu offers `Close`, `Collapse`
  becomes "show in drawer".
- `phone="drawers"` (opt-in): the left- and right-most groups become `pk-drawer` (`side` left/right, `docked` false, modal) opened from toolbar buttons,
  the centre group fills the screen; bottom panels become a bottom-sheet drawer. `auto` chooses tabs (simplest, no overlay). This is open question 3.
- Touch drag-to-dock is off on phone (`dragDock` ignored); the menu path is the only path, which is also why it is mandatory.
- Tap targets 44 px in the strip (the scorecard's touch-target check applies).

## 7. Accessibility

- Region: the dock is `role="group"` with `aria-label` from `label` (not `application`; no custom key model that takes over the whole page).
- Each group is a `pk-tabs` (`role="tablist"`/`tab`/`tabpanel`, roving tabindex). A single-panel group is a `region` labelled by its heading.
- Splitters are `role="separator"` with `aria-orientation`, `aria-valuenow/min/max` and their keyboard (already in `pk-splitter`).
- Collapsible headers: a `button` with `aria-expanded` and `aria-controls`; collapsed content is `hidden`/inert, not just clipped.
- Rail icons are buttons with an accessible name (title from the declaration) and `aria-expanded` for the flyout; the flyout returns focus to the rail button on Escape.
- Drag has full non-drag parity (section 2), announced by a live region; the drop-zone overlay is decorative (`aria-hidden`) because the menu names its targets in text.
- Focus is never lost on a structural change (rules in section 2); a removed group moves focus to its neighbour.
- Reduced motion: no animation on dock, float or collapse when `prefers-reduced-motion: reduce`; forced-colours: drop zones and focus rings use system colours (outlines, never fills only).
- Contrast, tap-target and name audits already run on gallery examples (`ui-review`); the scorecard quality run must stay at zero errors.

## 8. Performance

- **Model ops are pure and O(nodes)** with structural sharing: an edit copies only the path to the changed node, so a resize (a 60 Hz stream during a drag)
  allocates a handful of small objects. The limits in invariant 6 bound the worst case.
- **Resize does not rebuild.** A drag calls `pk-splitter` (which sets two CSS custom properties) and the model is updated once on release
  (`pk-resize`), so no per-frame reconcile, no layout thrash; floater moves set `transform` on the frame during the drag and commit the rect on release.
- **Keyed reconcile** by node id patches only affected splitters/tab groups on a structural change; slotted panel content is never re-created or moved.
- **Lazy panels:** a `pk-dock-panel` may set `lazy`, so its content is only rendered (by the consumer) when it first becomes the active tab; hidden
  tabs keep state but not per-frame cost (they are `hidden`, out of layout).
- Drag-time work: one `pointermove` handler per session, hit-testing against cached group rects captured at drag start (no `getBoundingClientRect` per move).
- `ResizeObserver` on the dock box only (for floater clamping and phone switch), disconnected in `disconnected()`.
- The element loads lazily like others; `dock-model.js` is imported by both the element and a node build (no DOM), so it costs nothing until used.

## 9. Blazor mapping

Following "the SDK and Blazor change together":

- `PkDock` component with `[Parameter] Layout` (a `PkDockLayout` record mirroring the JSON, serialised by the same schema), `PersistKey`, `Label`, `Floating`,
  `DragDock`, `Undo`, `Phone`, callbacks `OnLayoutChange`, `OnPanelClose`; `PkDockPanel` with `PanelId`, `Heading`, `Icon`, `Closable`, `DefaultGroup`, `ChildContent`,
  `Actions`.
- `blazor/mappings/dock.json` and `dock-panel.json` (props, events, slots), generated wrappers per the existing mapping pipeline; the layout is
  round-tripped as a JSON string parameter validated by the same `fromJson` in JS, and `PkDockLayout.Parse` on the .NET side mirrors the schema version so an
  unknown version is rejected there too.
- Controlled mode like `pk-drawer` `controlled`: the Blazor host owns `Layout`; the element raises `pk-layout-change` and applies nothing until the
  parameter comes back (needed for server-side state). A `controlled` boolean is added if this proves needed (open question 8).
- A `dock` template/sample in the Blazor sample app; skills in `scripts/skills/` describe the panel declarations and the persistence key.

## 10. Review scenarios and browser cases

Layout expectations are measuring browser cases in `core/tests/browser/` (`cases-dock.js`), written before the CSS, and UI states a still example cannot show
are scenarios in `core/tests/review/scenarios/`:

**Node tests (model, `core/js/dock-model.test.mjs`):** invariants after every op including a randomised sequence (property test, seeded); `fromJson` with hostile,
truncated, oversized, old-version, newer-version and panel-added/removed inputs; undo/redo coalescing; dock zone geometry (pure `zoneAt(rect, x, y)` exported for
the tests); menu target lists (pure `moveTargets(doc, panel)`), key-to-operation mapping, phone flatten order.

**Browser cases:** three-column layout: columns are side by side and sum to the dock width within a pixel; splitter keyboard resizes and the model size
follows; a collapsed panel is header height; a rail is `--pk-dock-rail-width`; floater stays inside the dock bounds after the dock shrinks; a docked move keeps a
slotted input's value and scroll offset (the state-survival promise); phone flattens to one visible panel with a tab per panel and no horizontal overflow.

**Scenarios (`dock-drag-dock`, `dock-menu-move`, `dock-float`, `dock-collapse-rail`, `dock-phone`, `dock-rtl`):** drag a tab over each drop zone (screenshot of the
overlay per zone), drop; the *same* result through the menu (`click`, `key`) with the `t.within`/`t.flushBelow` checks; a floater dragged, resized, docked back;
collapsed rail with a flyout; hover/focus rings unclipped (`t.ringUnclipped`); right-to-left mirroring; phone 375. Every screenshot is opened and looked at before the PR
that adds the element is called done, as the UI review rules require.

## 11. Size budget expectation

Budgets are never raised. Estimates: `dock-model.js` about 350 lines (about 4 KB gzip), no CSS, loaded lazily; `pk-dock` about 250 lines JS + 60 lines CSS (about 4 KB gzip
element chunk) because rendering and input are delegated to `pk-splitter`, `pk-tabs`, `pk-sortable`, `pk-dropdown`; `pk-dock-panel` about 30 lines. No change to the
10 KB page layer. If the element misses its budget the fix is to make it smaller (delegate more, drop `phone=drawers` first), not to raise the budget.

## 12. Implementation breakdown

Each step is one issue and one pull request (about 400 hand-written lines or less), leaves `main` releasable, and adds docs, gallery samples, skills text and a changelog fragment.

| # | Step | Depends on | Size | Ships |
| --- | --- | --- | --- | --- |
| 1 | `dock-model.js`: shape, `emptyLayout`, `validate`, `toJson`/`fromJson` with migration and hostile-input tests | none | about 300 lines + tests | a pure module, node tests only, no visible change |
| 2 | Model operations: `dockPanel`, `dockRoot`, `moveTab`, `activate`, `resize`, `collapsePanel`, `closePanel`/`openPanel`, invariants and property test | 1 | about 350 | still no UI |
| 3 | Optional refactor: extract `createHistory` and the path ops to shared modules (layout builder unchanged) | 2 | about 60 | nothing visible |
| 4 | `pk-dock` + `pk-dock-panel`, docked only: render tree with `pk-splitter`/`pk-tabs`, slotting, collapse, keyboard reorder, Panels menu, live region, events, gallery sample, Blazor mapping | 2 | about 400 | the useful core: fixed-position dockable layout, fully keyboard-operable |
| 5 | Persistence: `persist-key`, store module, debounce, restore, migration test, `resetLayout` | 4 | about 150 | layouts survive reloads |
| 6 | Drag to dock (pointer/touch): zones overlay, `pk-sortable` tab cross-group drop, Escape cancel, scenarios | 4 | about 350 | drag, on top of the already-complete menu path |
| 7 | Floating panels: `floatPanel`/`dockFloating`/rect ops, floater layer, keyboard move/resize, clamp, scenario | 4 (6 for drag-to-float) | about 380 | floaters |
| 8 | Collapse-to-rail and flyout | 4 | about 200 | IDE-style rails |
| 9 | Phone: flatten to tab strip (and optionally `drawers`), phone browser cases and scenario | 4 | about 250 | phone support |
| 10 | Undo/redo (`undo` prop, history coalescing) and `Reset layout` UI | 4 | about 120 | undo |
| 11 | `workspace` page type opts into `dock` (`config.dock`), skills and guide "Build a dockable workspace" | 5 | about 150 | the framework path |
| 12 | Blazor: `PkDock`/`PkDockPanel` components and sample, if not already done in step 4 | 4 | about 300 | Blazor parity |

Steps 5 to 10 are independent of one another once 4 exists and can proceed in parallel; step 6 must not be the first UI (the accessible path ships first).

## 13. Open questions for the owner

1. **Extract or duplicate?** Move `createHistory` and the tree path helpers out of `layout-model.js` into small shared modules (step 3), or copy about 30 lines into `dock-model.js` and extract later?
2. **Slotted panel content.** OK that panels are light-DOM children slotted into the tree (state survives docking, the consumer owns content) at the cost of the consumer having to declare every panel up front? The alternative (element-created content from a factory callback) is more flexible but loses state on every move.
3. **Phone.** Tabs only (simple, no overlays), or also the opt-in `phone="drawers"` mode? Proposed: tabs only in the first release; drawers later if asked.
4. **Binary splits.** Is it acceptable that the model mirrors `pk-splitter`'s binary shape (three columns are two nested splits), or should `pk-splitter` grow an n-way sibling first? Proposed: binary, no splitter change.
5. **Rails and flyouts.** Is IDE-style collapse to a rail with a flyout wanted in the first cut, or is "collapse to header" (accordion-like) enough? Proposed: header-collapse in step 4, rails in step 8.
6. **Keyboard chords.** `Alt+Shift+Arrow` to move a panel and `Ctrl+Alt+F` to float: acceptable, or defer to the shell's shortcut registry (`js/shortcuts.js`) so the app can remap them?
7. **Named layouts / presets** (Design, Debug): app concern for now, or part of `pk-dock` later?
8. **Blazor controlled mode.** Add a `controlled` boolean now (like `pk-drawer`) or when a real Blazor server scenario needs it?
9. **Where does the floating layer live?** Inside the dock bounds only (proposed, no top layer) or allowed over the whole app shell? Inside-only keeps it out of the shell's stacking rules but a floater cannot leave the dock.
10. **`pk-workspace` overlap.** Keep `pk-workspace` as the simple three-slot layout indefinitely, or deprecate it once `pk-dock` and the `workspace` page type cover it? Proposed: keep both; `pk-workspace` is the cheap default and the phone-strip reference.
11. **Consumer of first resort.** Should the layout builder module or the theme editor become the first dogfooding consumer (Gallery dogfoods, per the app framework direction)? Proposed: the layout builder's palette | canvas | inspector, since it already fits the Toolbox | Canvas | Properties example in the issue.
