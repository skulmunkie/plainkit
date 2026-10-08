# Two elements for the parked modules: `pk-design-surface` and `pk-tray` (2026-10-08)

Design only. Owner decision: build both, for `core/modules/layout-builder` and `core/modules/tool-dock`, the two modules parked in #336 because no element covers their chrome. Nothing is built until the specs are confirmed.

Both follow the standing rules: tokens only (`--pk-<element>-<part>` hooks), no class strings or inline styles in the modules afterwards, CSP-safe positioning through `data-dyn` and `applyDynamic`, the ownership rules (host owns attributes and light-DOM children, the element owns its shadow tree, subscriptions outside the subtree in `connected()`/`disconnected()`), a `meta.json` per element, a gallery example, a measuring browser case per layout expectation, a scenario per state a still example cannot show, skills, and a generated Blazor wrapper.

---

## 1. `pk-design-surface` (for the layout builder)

### 1.1 What the module does by hand today (`layout-builder.css`, `layout-builder.js`)

- `.lb-canvas`: a bordered, padded, scrolling panel whose ground reads apart from the dock chrome and from the page in both themes (`color-mix(--color-bg 70%, --color-text 30%)`), keyboard-focusable, `contain: layout paint`.
- `.lb-page[data-width]`: the page being edited, framed at `phone` (375px) or `tablet` (768px) or full width, centred.
- Marks painted **on the page's own nodes** through attributes the module sets (`data-lb-selected`, `data-lb-hidden`, `data-lb-empty`, `data-lb-drop-target`): a solid accent outline for the selection, 50% opacity for a hidden node, a dashed outline on an empty container, a dashed accent outline on the container an external drag would drop into.
- `.lb-node-controls`: the Edit/Delete chip, `position: absolute`, moved by script to the top-right of the hovered (else selected) node's rectangle, outside the inert page so its buttons stay real, hidden while an external drag is in progress.
- The page itself is inert (a click selects, it does not follow links or submit).

### 1.2 Why nothing existing covers it

| Candidate | Why not |
|---|---|
| `pk-card` / `pk-container` | Frames content; has no scrolling ground, width frame, marks or chip. |
| `pk-sortable` | Orders a flat list's children and accepts external drops; no frame, selection, hidden or empty state, and it marks rows it owns, not arbitrary descendants. The builder already uses it *inside* the surface. |
| `pk-dock` | Hosts panels (it is the builder's real chrome); the surface lives in one of its panels. |
| `pk-context-menu` | Already used for the right-click menu; unrelated to the marks and chip. |
| `::slotted()` marks | The nodes to mark are **descendants at any depth** of the slotted page, and `::slotted()` reaches only the slot's direct children. Marks therefore have to be **overlay boxes drawn by the surface from each node's rectangle**, which is something only an element that owns the stacking context can do cleanly. |

### 1.3 Contract

Tag `pk-design-surface`, **tier `element`** (it renders only its own shadow structure; the chip and the page are slotted, so no `pk-*` is rendered), group "Layout & structure".

| Prop | Type | Default | Notes |
|---|---|---|---|
| `width` | enum `full`, `tablet`, `phone` | `full` | Frames the page; `tablet` and `phone` read tokens (below). |
| `label` | string | `""` | The surface's accessible name (it is `role="group"`, focusable). |
| `selected` | element (property, not an attribute) | `null` | The node to frame as selected. The host sets it; the surface draws the box and scrolls it into view when asked (`reveal()`). |
| `dropTarget` | element (property) | `null` | The container an external drag would drop into: dashed accent frame. |
| `chipFor` | element (property) | `null` | The node the action chip follows. Null hides it. |
| `dragging` | boolean, reflected | `false` | An external drag is in progress: the chip is hidden (the module's `lb-external-dragging`). |
| `inert` | boolean, reflected | `true` | The page is not interactive: the surface sets `inert` on its page wrapper (links and controls inside do nothing). |

Marks that belong to the **node** (hidden, empty) are read from the page itself, so the host does not have to hand elements around: any descendant of the page with the attribute `data-surface-hidden` is drawn at reduced opacity and with the "hidden" mark; one with `data-surface-empty` gets the dashed placeholder frame. The surface observes the page subtree for these attributes (`MutationObserver` on its own slotted subtree, disconnected in `disconnected()`) and re-lays the overlay on `ResizeObserver`/scroll. The host owns those attributes (it is the host's node), the surface only reads them.

| Slot | |
|---|---|
| default | The page being edited. |
| `chip` | The action chip: real buttons the host owns (Edit, Delete). The surface positions the slot's box at the top-right of `chipFor`'s rectangle, clamped to the surface so it never leaves the viewport edge, and never covers the node's own top-left. |
| `empty` | Shown when the default slot is empty (the module's "drag an element here" text). |

Events (bubble, composed, cancelable where it can be vetoed):

- `pk-surface-pick { target, additive }`: a pointer or touch press on the page, hit-tested to the deepest element in the page subtree (the surface does the `composedPath` walk the module does today); `additive` is the modifier key. The default action (selecting) is the host's; the surface never changes `selected` itself (ownership).
- `pk-surface-hover { target }`: the pointer moved to another node (null when it left). Throttled to animation frames.
- `pk-surface-key { key, shiftKey, altKey, ctrlKey }`: arrow, Delete and Escape on the focused surface, so the host implements select-with-arrows and Alt+arrows to move without the surface knowing the model.

Methods: `reveal(node)`, `nodeAt(x, y)`, `rectOf(node)` (relative to the surface's page box, accounting for scroll).

Parts: `frame` (the scrolling ground), `page` (the framed width box), `overlay` (the marks layer, `pointer-events: none`), `mark-selected`, `mark-drop`, `mark-hidden`, `mark-empty`, `chip` (wraps the slot).

CSS custom properties: `--pk-design-surface-bg` (ground, default the mix above), `--pk-design-surface-phone-w`, `--pk-design-surface-tablet-w` (defaults 375px and 768px, replacing `--lb-phone-w`/`--lb-tablet-w`), `--pk-design-surface-pad`. Mark widths and offsets come from tokens already in `tokens.css` (`--lb-mark-w`, `--lb-mark-offset`, `--lb-empty-offset` are renamed to `--surface-mark-w` etc. in the same change, since only the builder reads them).

States the scenario must show, every shot read: resting; width `phone`, `tablet`, `full`; selected node; selected node scrolled out of view then `reveal`ed; hidden node; empty container; drop target during an external drag with the chip hidden; chip next to a node at the right edge (clamped) and near the top (flips below); right-to-left; keyboard focus ring; high zoom. Expectations measured: `t.within` (marks inside the frame), `t.noOverlap` (chip does not cover its node's top-left corner), `t.inViewport` (chip), `t.ringUnclipped`.

Accessibility: the surface is `role="group"` with the accessible name; it is a single tab stop (`tabindex="0"`); arrow keys are reported to the host as `pk-surface-key`, which is how the builder gives an accessible way to select (the current hint text says exactly this). Marks are decoration (`aria-hidden`); selection state is announced by the host through its own live region (the structure tree and properties panel already name the selection). The inert page is not a keyboard trap: Tab leaves the surface.

Reuse: the width frame and ground are plain CSS in the element; the overlay position maths reuses the rectangle conversions the module has (`r.top - cRect.top + canvas.scrollTop`); `pk-sortable` stays the host's choice *inside* the page; `data-dyn` positioning is the existing `applyDynamic` path.

Blazor: a generated `PkDesignSurface` (props `Width`, `Label`, `Dragging`, `Inert`; `Selected`, `DropTarget`, `ChipFor` are element references: they are not expressible as plain parameters, so they are **methods** in the generated wrapper (`SelectAsync(ElementReference)`) or set by the hosting module; events `OnPick`, `OnHover`, `OnKey`; `Chip` and `Empty` as `RenderFragment`s). `PkLayoutBuilder` stays a `mount` wrapper around the module, so Blazor gains nothing it must hand-write.

What the module deletes after this: `.lb-canvas`, `.lb-page`, the three `[data-lb-*]` mark rules, `.lb-node-controls` and `.lb-external-dragging` (about 9 baseline findings in `layout-builder.css` and 4 S3 in `layout-builder.js`), plus the chip-position code (`applyDynamic` of top/left). The module's own stylesheet then holds only the palette/panel rules that SDK elements cover; if nothing is left, `layout-builder.css` and its S1/S10 entries go.

### 1.4 Steps

1. `pk-design-surface` core: element, frame, widths, marks from attributes, overlay, meta, gallery, node tests for the rectangle maths (about 400 lines).
2. Chip, hit-testing events, keyboard event, `reveal`; browser cases and the `design-surface` scenario (about 350).
3. Module adoption: the layout builder uses it, deletes its rules and code, baseline lowered, `layout-builder` scenario updated (about 300, mostly deletions).
4. Blazor wrapper and skills.

---

## 2. `pk-tray` (for the tool dock)

### 2.1 What the module does by hand today (`tool-dock.css`, `tool-dock.js`)

- `.td-surface--dock`: `position: fixed`, full width, `bottom: 0`, `z-index: var(--z-flyout)`, a height from a size choice (`small` 25vh, `medium` 40vh, `large` 65vh), scrolls inside, hairline top border, flyout shadow, `[hidden]` hides it. Not modal: no backdrop, no focus trap, the page stays usable.
- `.td-launcher`: a small `pk-button` fixed at the bottom end (`z-index: var(--z-pop)`) that stays reachable above the open panel; `aria-pressed` follows open.
- `.td-panel-body`: the panel's content reserves room under its last row for the launcher.
- A `Ctrl+\`` hotkey (document `keydown`, removed on destroy), a size `pk-button-group` and a Close button in the tab strip's trailing slot.

### 2.2 Why nothing existing covers it

| Candidate | Why not |
|---|---|
| `pk-drawer` | A native **modal** dialog (backdrop, focus trap, Escape). `docked` places it in the nearest positioned ancestor, not the viewport, and has no launcher or size choices. |
| `pk-dock` | A split-and-tab workspace of panels **inside a page**, not a flyout over it. |
| `pk-popover` / `pk-flyout` | Anchored to a trigger, sized to content, closed on outside press: the opposite of a persistent, non-modal, full-width tray. |
| `pk-toast` stack | Transient messages. |

### 2.3 Contract

Tag `pk-tray`, **tier `component`** (it renders a `pk-button` launcher and, optionally, the size `pk-button-group`), group "Overlays".

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | boolean, reflected | `false` | Shown or hidden. The element also writes it (launcher, Close, hotkey, `Escape` when focus is inside) and fires the events. |
| `size` | enum `small`, `medium`, `large` | `medium` | The panel's height as a share of the viewport height; the tokens below set the three values. |
| `sizes` | boolean, reflected | `false` | Draw the built-in size choice in the header (a `pk-button-group`, mode single); off lets the host provide its own. |
| `label` | string, required | `""` | The panel's accessible name (`role="region"`, landmark `complementary`). |
| `launcherLabel` | string, required | `""` | The floating launcher's text. |
| `hotkey` | string | `""` | A chord such as `Ctrl+\``; empty turns it off. The listener is the element's one subscription outside its subtree (added in `connected()`, removed in `disconnected()`); the chord parser moves from the module to `js/hotkey.js` and the module's `matchesHotkey` re-exports it. |
| `edge` | enum `bottom`, `start`, `end` | `bottom` | Only `bottom` is built in step 1; the others are reserved by the enum so the API does not change. |

| Slot | |
|---|---|
| default | The panel content (the module puts its `pk-tabs` here). The body scrolls; the last row gets `padding-block-end` equal to the launcher's height plus gap so nothing hides under it. |
| `trailing` | Extra header controls beside the size choice and Close. |
| `launcher` | Replaces the default launcher button's content (an icon). |

Events: `pk-open`, `pk-close` (cancelable close: a host may keep the tray open), `pk-size-change { size }`.

Methods: `show()`, `hide()`, `toggle()`.

Parts: `panel`, `header`, `body`, `launcher`, `sizes`, `close`.

CSS custom properties: `--pk-tray-height` (set from `size`; a host may override with its own length), `--pk-tray-small-h`, `--pk-tray-medium-h`, `--pk-tray-large-h` (defaults 25vh, 40vh, 65vh), `--pk-tray-z` (default `--z-flyout`), `--pk-tray-launcher-z` (default `--z-pop`).

Behaviour that matters:

- **Viewport-fixed in its own stacking context**: the panel and launcher are `position: fixed` inside the element's shadow tree; the element itself is `display: contents`, so it can sit anywhere in the DOM and still pin to the viewport (an ancestor with `transform` would break `position: fixed`; the element documents "place it as a direct child of `body` or of a non-transformed container" and a warning in the console says so once if it detects a transformed ancestor).
- **Non-modal**: no `<dialog>`, no `inert` on the rest of the page, no focus trap. When it opens by the launcher, focus moves to the panel's first focusable; when it closes by the launcher or Close, focus returns to the launcher; closing by hotkey leaves focus where it is.
- **Reserved room**: the size is the *panel* height; the page behind is not shrunk (non-modal overlay); the body's last-row padding keeps content clear of the launcher.
- Respects `prefers-reduced-motion` (no slide when reduced).
- The launcher stays a real `button` with `aria-pressed` and `aria-expanded`/`aria-controls` pointing at the panel (both are in the element's shadow root, so the ids resolve).

Accessibility: region with a name; Escape closes when focus is inside (and only then: a page-level Escape is not stolen); the launcher is the single, always-available way back; sizes are a labelled single-select button group; the hotkey is documented in the launcher's `title` and `aria-keyshortcuts` when set.

Tokens: only `--pk-tray-*`, `--space-*`, `--color-*`, `--shadow-flyout`, `--z-*`, `--touch-target`, `--duration-*`. The three size heights become tokens in `tokens.css` (`--tray-small-h` and so on), replacing the module's `SIZES` map of literals.

Reuse: the header's size choice reuses `pk-button-group`; the open/close key handling and focus return reuse `pk-drawer`'s focus-return logic by lifting the small pure helper (`focusReturn`) into `js/focus-return.js` (if it is not already shared); the shadow, border and z tokens are the ones `pk-drawer` uses; no `pk-dock` code is reused (different job), and the doc says when to choose which (drawer: modal; dock: panels inside a page; tray: persistent tool panel over a page).

Blazor: generated `PkTray` (`Open` with `OpenChanged` through the existing `bind` form, `Size`, `Sizes`, `Label`, `LauncherLabel`, `Hotkey`, `ChildContent`, `Trailing`, `Launcher` fragments, `OnOpen`, `OnClose`, `OnSizeChange`). `PkToolDock` (a `mount` wrapper) stays; `PkToolDockPanel`'s `blazorOnly` rationale is unchanged.

What the module deletes after this: both rules in `tool-dock.css` (so the stylesheet, S1 and S10, go), the `td-*` class strings, the `data-dyn` height, the size group, Close and launcher construction (about 60 lines of `tool-dock.js`), keeping the panel mounting, the tab strip and `activate`/`deactivate`.

States the scenario shows (every shot read): closed (launcher only); open at each size; long content scrolling inside with the last row clear of the launcher; a tall page behind (it still scrolls and is clickable); phone width (the panel fills the width and at most the viewport minus the launcher); right-to-left (launcher at the start side); reduced motion; dark and light.

### 2.4 Steps

1. `pk-tray` core: element, sizes, launcher, `open`/events, focus return, meta, gallery example, node tests for size mapping and the hotkey chord parser moved to `js/hotkey.js` (about 400 lines).
2. Browser cases (fixed to the viewport after the page scrolls, non-modal: a page button still clickable, Escape scope, focus return, no trap), the `tray` scenario (about 250).
3. Module adoption: `mountToolDock` uses it, `tool-dock.css` deleted, baseline lowered (about 200, mostly deletions).
4. Blazor wrapper and skills.

---

## 3. Questions for the owner

1. **Names.** `pk-design-surface` and `pk-tray`. `pk-canvas` was considered for the first (the module and #430 call it the canvas) but the page-type vocabulary already uses "canvas" for chart drawing surfaces in a few places; `pk-sheet` for the second but a sheet is usually modal.
2. **Marks from attributes versus a `marks` property.** The spec reads `data-surface-hidden`/`data-surface-empty` from the page nodes (the host sets them, as the module does now) because that keeps the host's model out of the element. The alternative is a `marks` array property of `{ node, kind }`; it avoids a MutationObserver but makes the host push every change.
3. **`pk-design-surface` tier.** `element` as specified (it renders no `pk-*`); if it should also draw the width switcher (the module's `375px | 768px | Full` buttons), it becomes `component`. The spec leaves the switcher to the host's toolbar so the surface stays an element.
4. **`edge` on `pk-tray`.** Reserve the enum now (recommended: no API change later) or ship `bottom` only.
5. **Hotkey inside the element or outside.** Specified inside (one tray, one chord). A page with several trays or a command-palette-owned shortcut may prefer the host to call `toggle()`; `hotkey=""` already allows that.
