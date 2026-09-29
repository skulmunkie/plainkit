# pk-os: a desktop/window-manager shell

Status: proposed design for owner review, not scoped for implementation. Refs #598 (reads #432's design spec and floating-panel work, #618, the app
framework #346, the standing tracker #336). No code changes accompany this document.

**Owner context folded in below**: the primary motivation for #598 is playing and showing off — an ambitious, fun, impressive demo of what
plainkit's elements can compose into, not a committed product requirement with a deadline or a customer. There is a secondary possibility the owner
uses it in a real app later, so it should be built at real quality, not thrown away — but it is not being scoped against a concrete deadline. That
changes the shape of several recommendations below from "here are the options" to "here is what I'd build," and it makes one thing — the skin system
— close to the actual point of the project rather than a nice-to-have layered on top.

## Why, and what "not yet scoped" means here

Issue #598 was filed only to track intent: an OS-desktop-style shell — multiple free-floating windows, a taskbar, a launcher, window focus/z-order —
distinct from `pk-dock`'s IDE-style docking layout inside one page. The issue names four open questions and one hard constraint: whoever designs this
must read #432 and its floating-panel step first, so plainkit doesn't grow two different floating/draggable-window implementations
(`core/STANDARDS.md`, "Composition": reuse, don't duplicate). This document answers those questions with an opinionated recommendation, not a menu —
given the low-stakes, exploratory motivation, the owner wants a point of view to react to, not an equally-weighted list to pick from.

## What already exists (read before designing pk-os's own window model)

`core/js/dock-model.js` (the pure tree model behind `pk-dock`, #432/#540) already has a floating layer, added in #622 per the round-2 priority
("floating panels are lower priority than typical IDE usage suggests... last among the big remaining features", #432 comment) and scoped by #618:

- A dock document is `{ version, seq, root, collapsed, floating }`. `floating` is an array of `{ id, x, y, w, h, z, group }` — a window-shaped overlay
  positioned **inside the dock's own bounds** (`core/js/dock-model.js:4`, "round 2 item 5"); `group` is a tab-group node, so a floater can itself hold
  multiple tabbed panels.
- Operations: `floatPanel` (lift a docked panel into a floater), `dockFloating` (drop a floater back into the tree), `moveFloater` / `resizeFloater`
  (rect changes, clamped to bounds), `raiseFloater` (z-order to front). All pure, validated, JSON-round-tripping, same shape as every other dock-model
  op (`{ doc, problems }`, never throws on data).
- Explicit non-goals of #432 itself (`docs/superpowers/specs/2026-09-28-dockable-layout-design.md`, "Non-goals"): *"No multi-window / pop-out into a
  browser window... 'Floating' means inside the pk-dock bounds,"* and *"No general window manager (no overlapping-window z-order beyond 'the last
  touched floater is on top', no snapping to other floaters, no minimise to a taskbar)."* Those two sentences are the boundary #598 sits on the other
  side of.
- Still missing even for `pk-dock`'s own floating panels (per #618 and the #432 verification comment): UI rendering (drag by title bar, resize
  handles) and the keyboard/menu/accessibility path (float / dock-back-in from the Panels menu, arrow-key move/resize, live-region announcements,
  focus management). These are **steps 2 and 3 of #618**, not yet built, tracked independently of #598.

Also read for what NOT to rebuild: `pk-splitter` (binary resizable split, keyboard resize), `pk-tabs`/`pk-tab`/`pk-sortable` (tab groups, drag
reorder and cross-group drag), `pk-card` (panel chrome), `js/app.js` (`defineModule`, `mountApp`, page types, layouts), `js/store.js`
(`createStore`, versioned/validated persistence). `core/tests/composition-audit.test.mjs` already forbids raw pointer-drag wiring, arrow-key
navigation and hand-built focus traps outside `core/elements/**` without an allow-list entry naming the promoting issue — any pk-os prototype work
would trip it immediately for a drag/resize/focus-trap built outside `pk-dock`, which is the mechanical proof that the reuse decision below is not
optional.

No other window-manager-like precedent exists: a repo-wide search of `core/elements/` and `core/js/` for `z-order`, `draggable`, `resizable` and
`window` (outside `globalThis`/`window` as the DOM global) turns up nothing besides `pk-dock`'s own floating-layer comments and code cited above, and
`pk-splitter`'s resize (a different, two-pane-percentage kind of "resizable"). There is exactly one floating/draggable-window implementation in the
toolkit today, in progress, and it is `pk-dock`'s.

## Relationship to pk-dock: reuse, don't duplicate

**`pk-os` does not get its own floating-window primitive.** The window model — position, size, z-order, drag, resize, all as operations on an
immutable document — already exists as `pk-dock`'s floating layer (`js/dock-model.js`), and steps 2 and 3 of #618 are already committed to building
its rendering, drag/resize and accessibility path. A second implementation of the same primitive, built for `pk-os` in parallel or after, is exactly
the duplication #598 was filed to warn against. This holds regardless of where `pk-os` itself ends up living (in-repo or its own project, see
"Shape" below) — it consumes `pk-dock` as a *published, versioned dependency* either way, never a copy of its logic.

Concretely, `pk-os` **is a full-viewport `pk-dock` instance used in "all-floating" mode**: a dock document whose `root` is empty (or a single
minimized-away placeholder) and whose windows are *entirely* `floating` entries. Nothing in `dock-model.js`'s shape forces a floater to have a
docked home — an app window that is never docked into the tree is a perfectly valid document, just one that never calls `dockFloating`. `pk-os`'s
"window" is a `pk-dock` floater; "open a window" is `floatPanel`; "close a window" is `closePanel`; "bring a window to front" is `raiseFloater`;
"drag" and "resize" are `moveFloater`/`resizeFloater` through the same UI #618 is already building. `pk-os` reuses 100% of that.

What `pk-os` adds — genuinely new, because `pk-dock` explicitly disclaims it (the two non-goal sentences quoted above) — is the **desktop chrome and
lifecycle** around that floating layer:

| Capability | Source |
| --- | --- |
| Position/size/z-order/drag/resize of a window | `pk-dock` floating layer (`js/dock-model.js`, #618) — reused as-is |
| Tabbed grouping inside one window | `pk-dock`'s `tabs` group node — reused as-is (a floater's `group` is already a tab group) |
| A window's chrome (title, close button) — shape only; look is a skin's job | `pk-card`-shaped header, same as a dock panel's header — reused as-is, then skinned (see "The skin system") |
| Minimize (hide without closing; distinct from `closePanel`) | **new**: a small, additive extension to `dock-model.js` (see "Window model") |
| Taskbar / dock for switching, restoring, minimizing | **new**: `pk-os` chrome, composing `pk-tabs` or a `pk-toolbar`-shaped strip — not a new primitive, an arrangement of existing ones |
| Launcher (start-menu-equivalent) | **new, in v1** (raised from deferred — see "Shape" and "The skin system": this is where a chunk of the demo value lives) |
| App registration contract | **new**: reuses `defineModule`'s shape (see "App contract"), does not invent a second one |
| Persistence of window layout | **new wiring, not new mechanism**: `createStore`, exactly as `pk-dock`'s `persist-key` already does |
| Visual identity (window chrome skin, taskbar position/style, launcher style) | **new, first-class**: the skin system, see below |

So the honest framing is: **`pk-os` is a consumer of `pk-dock`, not a sibling of it.** It contributes exactly what a desktop metaphor needs that an
IDE-panel metaphor does not — minimize/taskbar/launcher, app lifecycle, and a skinnable visual identity — and nothing else. If `pk-dock`'s floating
layer ever grows a constraint that blocks this (for example if steps 2/3 of #618 hard-code "floaters stay inside dock bounds" in a way that prevents
a window from covering the whole viewport, which it should not need to since the dock instance itself *is* the whole viewport here), that surfaces
as a comment on #618, not a fork.

## Shape: recommendation first, alternatives as real tradeoffs

**Recommendation: build `pk-os` as its own micro-project — a separate repo/package that depends on plainkit's published elements and `js/app.js`,
versioned and released on its own cadence, not merged into this monorepo.** Given the motivation is genuinely "let's build something fun and
impressive," not a roadmap item, this is the lead answer, not one bullet among equals:

- **It protects plainkit core's budgets without a fight.** Every size/complexity budget in `core/STANDARDS.md` (the 10 KB page-layer gzip cap, an
  element's own budget, the "small enough to review" PR-size norm in `AGENTS.md`) exists to keep the toolkit itself boring and dependable. A desktop
  shell with a launcher and multiple skins is not boring by nature, and it shouldn't have to become boring to get merged. Every increment of a fun
  project, built inside `core/`, would be judged against "does a component toolkit need this," which is the wrong question for something whose
  entire value is "look what you can build on top of the toolkit."
- **It matches the stakes.** Nothing here is blocking, scheduled, or promised to a consumer. A separate package can move fast, be genuinely
  ambitious (three skins, a launcher, sound effects, whatever), and ship on its own schedule without ever touching plainkit's release train,
  CI gates, or `verify.mjs` checks. If it turns out great, promoting pieces of it back into core (or keeping it as a permanent "look what plainkit
  can do" showcase package, like a devtools-only package such as #162) is a later, easy decision — nothing is lost by starting outside.
- **It is still real quality, not throwaway**, because of the secondary "might use it in a real app" possibility: a separate package is still a
  package — versioned, tested, with its own README and CI — it is just not *this* package. "Own micro-project" does not mean "prototype and forget,"
  it means "first-class citizen with a different center of gravity."

**Alternative 1: an app-framework page type inside this monorepo** (the technically cleanest option, and what this document would recommend under a
committed-product framing). `pk-os` as a page type (tentatively `os`) registered in `js/app/pages/os.js`, exactly parallel to `workspace` and
`dashboard`. Real advantages: zero packaging/versioning overhead, `ctx` (tasks/notify/dialogs/store/theme) for free from `mountApp`, and the tightest
possible coupling to `pk-dock`'s evolution (no dependency-version drift to manage). The cost, given the actual motivation here, is exactly what the
recommendation above is trying to avoid: every "for fun" addition (a Windows-98 skin with a specific sound on window-close, a launcher with search
and app icons in a grid) becomes a monorepo PR judged by contributors and CI against a toolkit's standards, for a feature whose entire point is not
being a toolkit feature. This remains the right call if the owner's intent shifts from "demo" to "we're going to depend on this," and nothing in the
window-model or app-contract design below needs to change to move it in-repo later — only the packaging boundary changes.

**Alternative 2: a single element, `<pk-os>`**, rejected either way. An "app" hosted in `pk-os` needs a mount lifecycle (start, stop, its own
state) — exactly what `defineModule`/`ctx` already model — and an element has no clean way to receive "a list of modules with mount/unmount
functions" without either reinventing a chunk of the app framework inside one element (a layering violation even from outside `core/`, since it
would mean re-deriving `defineModule`'s contract) or becoming an opaque, awkward callback-prop wrapper. This is rejected under both the in-repo and
micro-project framing.

**Practical shape of the micro-project**: a small repo (`plainkit-os`, name TBD, see open questions) with a `package.json` dependency on
`plainkit` (npm) for `pk-dock`, `pk-tabs`, `pk-card`, `pk-dropdown`/`pk-menu-item`, `js/app.js` and `js/store.js`; its own `app.config.js` using
`mountApp`; its own `os` page type (or, since it owns its own app, simply its own mount function — it does not need the full generality of a
registrable page type if it is the only consumer) built exactly as described in "App contract" and "Window model" below; its own skins as a small,
swappable CSS/token layer (see "The skin system"). Nothing in the design below changes based on which repo it lives in — the boundary is purely
packaging and review process, not architecture.

## App contract: reuse `defineModule`, not a new registration shape

An "app" hosted in `pk-os` **is a module**, exactly the `defineModule` shape every other part of the app framework already uses, whether `pk-os`
itself lives in this monorepo or its own. `pk-os` does not gain a second registration API — that would be inventing exactly the kind of parallel
concept the composition rule warns against, just one repository removed. The only new things a module needs to behave like a desktop app rather than
a routed page are a couple of optional, additive fields the desktop's mount code reads and everything else ignores:

```js
// apps/text-editor/text-editor.module.js — an "app" is a normal defineModule module.
import { defineModule } from 'plainkit/js/app.js';
import { mountEditor } from './text-editor.js';

export default defineModule({
    id: 'text-editor',
    title: 'Text Editor',
    icon: 'file-text',
    // os: optional, read only by pk-os's own mount code. Absent, a module behaves exactly as it does
    // routed normally through mountApp elsewhere — no coupling in the other direction.
    os: { icon: 'file-text', defaultRect: { w: 480, h: 360 }, singleton: false },
    routes: [{ path: '/', page: 'custom', config: { mount: (el, ctx) => mountEditor(el, ctx) } }],
    state: { version: 1, defaults: { lastFile: null }, persist: ['lastFile'] },
});
```

```js
// apps/file-browser/file-browser.module.js
export default defineModule({
    id: 'file-browser', title: 'Files', icon: 'folder',
    os: { defaultRect: { w: 360, h: 480 } },
    routes: [{ path: '/', page: 'custom', config: { mount: (el, ctx) => mountFileBrowser(el, ctx) } }],
});
```

```js
// apps/settings-panel/settings-panel.module.js
export default defineModule({
    id: 'settings', title: 'Settings', icon: 'settings',
    os: { singleton: true },   // opening it again while it's open just raises/focuses the existing window
    routes: [{ path: '/', page: 'custom', config: { mount: (el, ctx) => mountSettings(el, ctx) } }],
});
```

```js
// desktop.config.js — the whole project is basically this file plus a skin choice.
export default {
    modules: [textEditorModule, fileBrowserModule, settingsModule],
    skin: 'aero',   // or 'gnome', 'terminal', ... see "The skin system"
};
```

The desktop's own mount code (its `os.js`, whether that's a registered page type in-repo or a plain module in the micro-project) does the work:
builds one `pk-dock` filling the viewport, reads the configured app list, and for each **open** window calls that module's own `mount(ctx)` (the
same lifecycle `defineModule` already defines) into a floater it creates with `floatPanel`, using `os.defaultRect` as the floater's initial rect and
`os.icon`/`title` for the window chrome and taskbar/launcher entry. Opening a second window of a `singleton` app calls `raiseFloater` on the existing
one instead of mounting a second instance. A module needs no awareness that it is being hosted in a window rather than routed normally — `ctx` is
identical either way, which is the same design already used for `workspace`'s `panes`.

This is deliberately not a "port an existing pk-* element in as an app" contract distinct from modules: an existing `pk-*` element becomes an app by
wrapping it with `moduleFromMount` (`js/app/module.js`, already built for exactly this — "wraps an existing mountX(container, options) tool module
... as a module with one 'custom' page, unchanged"), the same path any tool module takes into the app framework today. No new wrapping mechanism,
whichever repo does the wrapping.

## The skin system: first-class, not an afterthought

Given the motivation is showing off what's possible, the skin is close to the actual point: a Windows-95/Aero-style chrome (beveled title bars,
a bottom taskbar with a Start button), a macOS-style chrome (traffic-light buttons top-left, a top menu bar, a bottom dock instead of a taskbar), a
GNOME/Linux-style chrome (an "Activities" overview as the launcher, a minimal top bar) look and *feel* different from each other, not just
differently colored. That distinctiveness is where most of the demo value lives, so it gets designed now, not bolted on later.

**Architecture: engine and skin are separate from day one.**

- **The engine** (window model, taskbar/launcher *behavior*, focus/z-order, keyboard handling, persistence) never varies by skin and never contains
  skin-specific markup, class names, or logic. It emits structural DOM (a window, a title bar region, a taskbar entry, a launcher trigger) and pure
  state (open/focused/minimized/position), styled entirely through **tokens** — the same discipline `core/STANDARDS.md` already requires
  (`--color-*`, `--space-*`, etc. for the toolkit; here, a small additional set of `--pk-os-*` tokens: `--pk-os-titlebar-height`,
  `--pk-os-taskbar-position` (as a value the layout reads, e.g. `bottom`/`top`), `--pk-os-window-radius`, `--pk-os-chrome-bg`, and similar). No
  skin-conditional branches in the engine's JS (`if (skin === 'aero') ...`) — a skin is data (tokens + a stylesheet + optionally a couple of small
  swappable icon/label sets for the launcher and window controls), not code paths.
- **A skin is a CSS file plus a small config object**: the token values, which corner window controls render in (a `windowControls: 'left' | 'right'`
  flag the engine's title-bar template reads, since "traffic lights on the left" vs. "minimize/maximize/close on the right" is a structural mirror,
  not just color), where the taskbar/dock sits (`taskbarPosition: 'bottom' | 'top'`), and what the launcher looks like (a Start-menu-style list vs.
  a full-screen icon-grid overview vs. a dock-style app strip — this is enough of a structural difference that the launcher itself needs a `variant`
  the engine supports, not just CSS).
- **v1 ships at least two skins that are structurally distinct, not palette swaps**: recommend a Windows-style skin (bottom taskbar with a Start
  button/menu, title bar with right-aligned min/max/close, beveled/skeuomorphic-lite chrome) and a macOS-style skin (top menu bar, bottom dock as the
  launcher/taskbar hybrid, left-aligned traffic-light window controls, rounded chrome) as the two v1 skins — they differ in taskbar position, control
  placement and launcher shape, which exercises the engine/skin boundary honestly rather than proving it with two skins that only swap colors. A
  GNOME-style third skin is a good v1.1 addition (it mainly differs from macOS in taskbar/launcher content, not structural position, so it's a
  smaller increment once the boundary is proven).
- **This is a bigger, more central design decision than the window model itself for this project's actual goals**, so it deserves the same
  "reuse, don't duplicate" discipline `pk-dock` got: window *chrome* structure (a titled, closable region with a header and body) is still
  `pk-card`-shaped underneath every skin, and a skin never re-implements layout, only re-styles and re-arranges via tokens and the couple of
  structural flags above.

## Window model: v1 is more ambitious here than a typical toolkit feature would be

Because this project's value is largely in feeling complete and impressive, and because it is not fighting a monorepo's size/scope discipline, v1
scope leans generous rather than minimal — with one line held firm regardless: accessibility is v1, not deferred (see below and "Accessibility").

| Capability | v1 | Why |
| --- | --- | --- |
| Open / close a window | Yes | `floatPanel` / `closePanel`, already in `dock-model.js` |
| Focus / z-order (click or keyboard to raise) | Yes | `raiseFloater`, already in `dock-model.js` |
| Drag to move | Yes, once #618 step 2 ships | `moveFloater`; no `pk-os`-side code, reuses the pointer-drag UI `pk-dock` is already building |
| Resize | Yes, once #618 step 2 ships | `resizeFloater`; same reuse |
| **Keyboard move/resize/switch, full non-pointer path** | **Yes, v1, not deferred** | See "Accessibility": this is a first-class v1 path, held firm despite the playful motivation, because retrofitting it later is much harder than designing it in, and because the "might use it in a real app" possibility makes this the one place not to cut corners |
| Taskbar (list open + minimized windows, click or keyboard to raise/restore) | Yes | `pk-os`'s own chrome, skinned per "The skin system" |
| Launcher (open a closed/not-yet-running app) | **Yes, v1** (raised from the original brief's "maybe never") | This is genuinely part of the demo: a Start menu or an Activities-style overview is a recognizable, high-impact piece of "this feels like a desktop," and it is where a chunk of the skin's personality shows up. Built from `pk-dropdown`+`pk-menu-item` (Windows-style Start menu) or a `pk-dialog`-hosted grid of buttons (GNOME-style overview) — composed, not hand-rolled |
| Minimize / restore | Yes | New, small model extension (below) |
| Maximize (fill the desktop, remember the pre-maximize rect) | **Yes, v1** (raised from v1.1) | Cheap once drag/resize exist (one remembered rect per floater) and expected the moment a real title bar has min/max/close buttons, which the skin work above already commits to drawing |
| Snapping to edges/other windows, tiling | Deferred, no issue yet | Genuinely more engine work than the demo needs; `pk-dock`'s own floating layer explicitly excludes it too, so this stays a `pk-dock`/#618 feature request if ever wanted, not a `pk-os` side-build |
| Cross-window drag-and-drop of content | Deferred | Orthogonal to the window manager itself, real scope of its own |
| Persistence of window layout | Yes, default off | See "Persistence" |

### Minimize and maximize: the model pieces `dock-model.js` needs

`dock-model.js` has `collapsed` (fold a *docked* panel to its header) but nothing for "hide a floater without closing it" or "remember a floater's
rect before filling the viewport." Two small, additive pieces, matching the existing shape exactly:

- A `minimized` array of floater ids (sibling to `collapsed`), plus `minimizeFloater(doc, { floater })` / `restoreFloater(doc, { floater })` ops,
  same `{ doc, problems }` shape, same invariants style (a minimized id must reference a live floater; restore clears it and calls `raiseFloater`).
- A `restoreRect` field on a maximized floater entry (the rect it had before `maximizeFloater` filled the bounds), cleared by `restoreFloater`'s
  un-maximize counterpart (or the same `restoreFloater` op doing double duty for "un-minimize" and "un-maximize," since both mean "put this floater
  back to what it remembers" — worth resolving as one op during actual implementation, not two).
- Neither op needs `pk-dock` to render anything special — a minimized floater simply is not drawn, a maximized one is drawn at the dock's full
  bounds. The desktop's taskbar/window-controls chrome is what turns this state into a visible, clickable affordance.
- **These are requested as an addition to #618**, not built inside `pk-os`'s own code, for the same reason #598 itself says to read #618 first: this
  is floating-layer state, and #618 is where the floating layer lives — true regardless of which repository ends up consuming it.

## Persistence

Window layout (open apps, their rects, z-order, minimized/maximized set) persists the same way `pk-dock`'s own docked layout does: a `persist-key`
through `createStore` (`js/store.js`), a namespaced store module (for example `os` under whatever prefix the project uses), versioned and validated
exactly like any other store module — corrupt or oversized data falls back to defaults with one logged warning, never a thrown error.

**Default when not configured: no persistence.** Every window opens fresh (the `os.defaultRect` from its module definition) on each visit, same as
`pk-dock`'s own default (persistence there is opt-in via `persist-key`, not automatic). Recommend the micro-project turn persistence **on by default**
for its own demo/config, though — unlike a generic toolkit page type that must default to writing nothing, a specific desktop demo genuinely gets
better ("your windows are where you left them") by persisting out of the box, and it costs nothing extra to wire since the mechanism is opt-in at the
`createStore` call site either way.

## Accessibility: first-class v1, not softened by the playful framing

The motivation being "fun" does not lower the accessibility bar — if anything the "might use it in a real app later" possibility raises it, since
retrofitting keyboard/screen-reader support into a window manager after the fact is materially harder than designing it in from the start (every
interaction — drag, z-order, minimize — needs a non-pointer equivalent baked into the same op, not bolted on as an afterthought). Four distinct
problems, each with a concrete, v1 answer:

1. **Window focus management.** Opening a window moves focus into it (its title bar or first focusable control, mirroring native window-open
   behavior); closing or minimizing a window returns focus to the taskbar entry that represented it (or the control that triggered the close), never
   dropped to `<body>`. This reuses whatever focus-return pattern `pk-dialog`/`pk-drawer` already establish for "opening one thing shifts focus,
   closing it must give focus somewhere sane" — not a new pattern, an application of an existing one.
2. **Keyboard-only window switching, in v1.** The taskbar is a real tab-list-shaped control (built from `pk-tabs` or a similarly-composed strip,
   never a div of clickable spans — `core/STANDARDS.md` "reuse the existing elements, hand-roll nothing"), so arrow-key/Home/End navigation between
   taskbar entries and Enter/Space to raise-or-restore come from that element's existing keyboard model, not new code. A global "cycle windows"
   shortcut (an Alt+Tab equivalent) **ships in v1 too, held to a fixed, documented chord** (not a shortcuts-registry addition, since this project is
   not part of the shared `js/shortcuts.js` surface if it lives outside the monorepo — see open question 6) rather than deferred, because it is the
   single most expected keyboard behavior of anything calling itself a window manager, and it is cheap: cycle the same order the taskbar lists, reuse
   `raiseFloater`.
3. **Screen-reader users navigating a windowed UI.** The floating/z-order visual model means nothing to a non-visual user; the taskbar (and the
   launcher) are therefore the canonical, always-available way to manage windows — a screen-reader user opens, raises, minimizes and closes entirely
   through them, never relying on spatial z-order. Each open/close/minimize/maximize/restore raises a polite live-region announcement ("Text Editor
   opened", "Settings minimized"), the same announcement pattern `pk-dock`'s own panel ops already use and the app shell's own route-change
   announcement — a well-proven pattern, applied a third time, not invented.
4. **A window that traps focus vs. one that doesn't.** A `pk-os` window is non-modal by definition (multiple windows are usable at once) — no focus
   trap is installed, matching `pk-dock`'s own panels. Worth stating explicitly because "make it feel like a real OS window" can tempt borrowing
   modal-dialog focus-trap logic where it doesn't belong.

**Skin-specific note**: whichever skin is active, the accessibility tree and keyboard model stay identical — a skin changes what things look like and
where they sit, never how they behave for keyboard or screen-reader users. This is a direct consequence of the engine/skin split above and is worth
stating as a hard rule, not just a hoped-for outcome: no skin may ship a launcher variant or taskbar position that has no keyboard path, even if it
looks convincing with a mouse.

## Non-goals for v1

- **Snapping/tiling between windows.** Out of scope for `pk-dock`'s floating layer itself (its own stated non-goal); `pk-os` inherits that boundary
  rather than reimplementing tiling on top.
- **Cross-window drag-and-drop of content** (dragging a file from the file-browser app into the text-editor app). A real feature, but orthogonal to
  the window-manager shell itself and not named anywhere in #598 — a separate issue/increment if wanted, after v1 proves out.
- **Popping a window out into a real, separate browser window** (`window.open`). #432 explicitly excludes this for `pk-dock`'s floating layer
  ("no multi-window / pop-out into a browser window... 'floating' means inside the pk-dock bounds"); `pk-os` inherits the same boundary — a
  `pk-os` "window" is a floater inside one page's viewport, not an OS-level browser window. Revisiting this is a `pk-dock`/#618 decision, not a
  `pk-os` one, since the primitive lives there.
- **Mobile/phone layout beyond what `pk-dock` already gives.** `pk-dock` itself flattens to a single tab strip on phone (#432, decision: "tabs only,
  no drawers mode"); `pk-os` on phone should do the same — the taskbar becomes the tab strip, one "window" visible at a time, no floating, no skin
  chrome beyond the tab strip. A phone-specific skin treatment is explicitly not v1: the desktop metaphor is inherently a wide-viewport thing, and a
  convincing phone skin (if ever wanted) is its own design pass, not a v1 line item.
- **Server-side or cross-device window-state sync.** Persistence is local storage via `createStore`, same ceiling as every other persisted SDK
  state.
- **A third (or later) skin beyond the two v1 ones.** GNOME-style is a good v1.1 candidate (noted above) but not required to prove the engine/skin
  split, which two structurally-different skins already do.

## Open questions for the owner

Kept short and genuinely undecidable without owner input — everything decidable from the stated motivation has been decided above, not punted.

1. **Confirm the micro-project recommendation, or say "in-repo" if the intent is closer to a committed feature than a demo.** This document leads
   with "own repo" for the reasons in "Shape"; if the owner's actual appetite is more "this should live in plainkit's app-framework story," say so
   and Alternative 1 becomes the plan with no other design change needed.
2. **Naming**, for the project and the desktop concept inside it (`pk-os` reads a little grand for what's mostly "a themed `pk-dock` with a
   taskbar and launcher"). No strong opinion offered here beyond: if it stays a separate repo, it doesn't need a `pk-` prefix at all (that prefix is
   reserved for elements in this toolkit, per `core/STANDARDS.md` "Names"), and a project name unrelated to "OS" might read better once it's clear
   what it actually is.
3. **Which two skins ship first** — this document recommends Windows-style + macOS-style as the pair that best proves the engine/skin split (see
   "The skin system"), but if the owner has a specific pairing in mind (e.g. wants the GNOME-style one in v1 instead of macOS), that's worth stating
   before work starts, since it's the skin config's `variant`/`windowControls`/`taskbarPosition` flags that need to cover whatever's chosen.
4. **Minimize/maximize as a `dock-model.js` addition (recommended above, filed against #618)** — does the #618 assignee want that folded into
   #618's remaining steps, or filed as its own follow-up once #618 lands? A scheduling call, not a design one, but it gates when `pk-os` work can
   start for real.
5. **If this lives outside the monorepo, does the global "cycle windows" shortcut need to go through `js/shortcuts.js`'s registry anyway** (by
   depending on that module from plainkit, since it's just a predicate function, not framework-specific), **or is a fixed, undocumented-elsewhere
   chord fine for a separate project?** Leaning toward reusing `js/shortcuts.js` if it's cheap to import (consistent behavior, one less thing to
   reinvent) — worth a quick confirmation rather than assuming either way.

## Summary of the decision this document asks the owner to make

Recommendation: build `pk-os` as its own small, real-quality package outside this monorepo, consuming plainkit's published elements (`pk-dock`
above all) rather than duplicating any of their logic — a full-viewport `pk-dock` in all-floating mode, `defineModule` modules as windows via their
existing `mount(ctx)` lifecycle (no new app-registration shape), a first-class engine/skin split with two structurally distinct skins in v1
(Windows-style and macOS-style), a launcher and maximize pulled into v1 because they're where the demo value concentrates, and full keyboard/screen-
reader support in v1 rather than deferred, because this is the one corner not worth cutting given the "might become a real app" possibility. The
only piece requested of plainkit core itself is a small `minimized`/maximize-rect addition to `dock-model.js`, filed against #618 rather than built
standalone, keeping the entire floating/draggable-window primitive singular in the toolkit, exactly as #598's own filing asked.
