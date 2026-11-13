# Layout builder as an app, and a free panel/dock workbench

Status: proposal for owner decision. Date: 2026-11-13. Docs only, no product code. Refs #1996, #1997 (background: #30, #174, #180, #432, #590, #593, #1929, #1943).

## 0. Summary and recommendation

1. **Nothing new is needed at the element level for the free composition.** `pk-dock` already is a tree of splits and tab groups of any depth, with panels as slotted children, collapse-to-rail with flyout, floating panels, persistence and a JSON layout. The VS Code workbench is an arrangement of it, not a template. What is missing are five **small extensions of existing elements** (section 3): a header-actions slot on a dock panel, a vertical/rail presentation for a tab group (the activity bar), a per-panel tab strip with `overflow="menu"` (already in `pk-tabs`, just must be reachable from a dock group), a status strip (a `pk-toolbar` use, no new element), and an "instances" pattern built from `pk-tabs` + `pk-list`/`pk-tree` in a `pk-splitter` (no new element).
2. **The builder becomes its own app** (`mountApp` with one module per tool area, no gallery shell), served as its own page of the Pages site and as a module usable from any host. The gallery module keeps a launcher link, not an embedded copy.
3. **Nesting** is a model change (drop into any slot at any depth, container-vs-leaf from the element API), not a new element. The palette group "Layout & structure" is split into real containers and page-level constructs (section 5).
4. **Events, properties and styles are declarative**: a `bindings` map per node in the JSON model, interpreted by a tiny action runner (a fixed verb list, no code). Styles go through tokens and `--pk-<element>-<part>` hooks and export as a generated stylesheet class, never an inline `style`.
5. **The terminal is two things.** The *scripts/commands panel* is declarative (run a named action, set a property, dispatch an event, query the model) and runs in core CSP-safe. A *real language runtime* (shell, JS eval) cannot run under `script-src 'self'` in the page: it lives **outside the page** (local dev host over a loopback WebSocket, or Blazor Server), and the in-page panel is only a client for it. We do not ship `eval`.
6. The work is nine releasable steps of about 400 lines or less (section 9). Steps 1 to 5 need no new element and no ceiling change.

Correction to a premise in the task brief: **`plainkit.ide` is the editor-metadata package** (`custom-elements.json`, `elements.d.ts`, `web-types.json`, `vscode.html-custom-data.json`: `packages.json`, id `plainkit.ide`), not an IDE runtime. New builder code does not belong in it. The right homes are a lazy module chunk (`modules/layout-builder`, already shipped in `plainkit.tools`) or, for a dedicated package, the "builder and IDE elements to plainkit.ide" idea in the size review (step 5 there) which is a packaging move of the existing builder elements and should be decided with that review (open question 6).

## 1. What exists today

| Piece | Where | What it gives |
| --- | --- | --- |
| Layout builder module | `core/modules/layout-builder/layout-builder.js` (579 lines), `.css`, `DESIGN.md`; site host `core/site/modules/layout-builder.js` | `mountLayoutBuilder(container, opts)`: palette from `api.json`, inert live canvas in `pk-design-surface`, structure `pk-tree`, property form, undo, HTML/JSON export. Chrome is a `pk-dock` (Palette/Structure/HTML tabs left, canvas centre, Properties right). Mounted as one **module of the gallery app** with `height: 75dvh`. |
| Builder logic | `core/js/layout-model.js`, `layout-tree.js`, `layout-ops.js`, `layout-schema.js`, `layout-validate.js`, `layout-html.js`, `layout-builder-logic.js`, `element-inspector*.js` | Pure JSON tree `{version, seq, nodes}`, node `{id, tag, props, slots}`; sanitised `toHtml/fromHtml`; no script, no `on*`, no `style` by construction (`DESIGN.md` section 1). Scope v1: "layout and content only. No bindings, no event wiring" (section 2); a reserved opaque `bind` map is mentioned there. |
| Drop model | `layout-builder.js` header; #174 | Top-level order is a `pk-sortable`; palette drag drops between top-level rows or **into the default slot of a container** (geometry hit test). Reordering inside a container and moving into/out of one is keyboard/menu only (Alt+arrows), because wrapping slotted children in `pk-sortable-item` breaks `::slotted()` stylesheets. |
| Dock | `core/components/dock/` (tier component, package `plainkit.dock`), `core/js/dock-{model,tree,json,render,drag,float,flyout,history}.js` | Binary tree of `split` (orientation, size, min, max) and `tabs` groups (ordered panel ids + active); panels are slotted light-DOM elements `slot="<id>"` with `data-heading`, `data-group`, `data-closable`, `data-collapsible`, `data-open`, `data-float`; Move menu, drag-to-dock, collapse to header, **collapse to edge rail with flyout**, floating panels inside the dock's bounds, Panels menu, `persistKey`, `layout` JSON, `toolbar-start` slot, phone flattens to one tab strip (#432 and #540 to #618). Undo history in `dock-history.js`. |
| Workspace | `core/elements/workspace/` (tier element) | Static nav/main/aside page frame, panes become tabs on a phone. Kept alongside the dock (#593 criteria). |
| Tabs | `core/components/tabs/` | `overflow`: `scroll` (default, edge fades), `menu` (hidden tabs behind a "..." button, selected tab pinned), `wrap`; `trailing` slot; roving tabindex; no vertical orientation. |
| Splitter | `core/elements/splitter/` | Two panes, `orientation`, `size/min/max`, `collapsible`, `persistKey`, `start`/`end` slots; the primitive under dock splits. |
| Nav, rail | `core/elements/side-nav` (`collapsed` = icon rail with tooltips and flyouts, `persist`, drawer at 1024), `core/shells/app-shell`, `core/shells/app-frame` (nav, header, one scrolling body; `flush`, `contain`) | An app-level navigation rail. Not stackable in two groups; the owner's "top and bottom groups that fold over each other" is not covered. |
| Tray | `core/components/tray/` and `core/modules/tool-dock/` (spec `2026-09-29-tool-dock-module-design.md`) | One tabbed panel floating over the page at an edge with named sizes and a hotkey; devtools uses it. Different job from a workspace (that spec's naming section). |
| Console module | `core/modules/console/console.js` | A **read-only** live view (console, errors, pk events, network, elements, environment). Header: "There is deliberately no JavaScript prompt: running typed code needs eval, which the SDK's strict CSP forbids." |
| Page types | `core/pages/*` (12 page types), `core/js/page-*.js`; #1929 approved A + C + cheap D (shared page base, `definePage`, static mode) | Page-level constructs: `pk-list-page`, `pk-record-page`, `pk-settings-page`, ... Spec `2026-11-04-page-types-audit.md` is on branch `agent/pagetypes-audit`, not yet on main; its steps are sequenced in #1929. |
| Action model | `docs/superpowers/specs/2026-11-12-page-actions-model.md` (#1943) | One action descriptor and one renderer for page bars; `pk-action {key}` is the single event. The builder's bindings should reuse this vocabulary (section 6). |
| Budgets | `docs/superpowers/specs/2026-11-12-size-budgets-review.md` | Owner direction: carve out, do not raise; lazy feature chunk per feature with its own ledger entry (default 2 KB gzip); dock element overrides 3.65 KB (stale dist reads 4,037 B). |

## 2. Gap analysis against the requirements

| # | Requirement | Today | Gap | Closed by |
| --- | --- | --- | --- | --- |
| 1 | Builder is its own app, not inside the gallery shell (#1996) | One gallery module at `75dvh`, so the gallery nav, header and body padding surround it | Own entry page and shell; the gallery keeps a link | section 4, step 1 |
| 2a | Palette containers accept nested components | Drop into the default slot of a container only, one level by geometry; no drop into named slots; no in-container reorder by pointer | Drop targets at any depth and per slot; pointer reorder inside containers | section 5, steps 2 and 3 |
| 2b | "Layout & structure" group needs rethinking | The group (8 entries: canvas, detail-layout, page-header, page-shell, toolbar, workspace, app-frame, app-shell) mixes real containers, page constructs and app shells; "Layout" (16) and "Containers" (5) overlap it | Palette taxonomy driven by metadata, not by the gallery group | section 5, step 3 |
| 3a | Events on built elements | Model has no handlers; v1 explicitly excluded them; CSP forbids inline handlers | `bindings` in the model, an action runner, export format | section 6, steps 5 to 7 |
| 3b | Custom styles on selected elements | Model forbids `style`; the inspector edits props only | A style editor over tokens and `--pk-<element>-<part>` hooks; export as a stylesheet | section 6.3, step 6 |
| 3c | Console/terminal panel | Console module is read-only; no input | Command panel (declarative) and a runtime bridge (not in the page) | section 7, steps 7 to 9 |
| 4a | Free composition: any number of regions that dock, tab, split, collapse, stack, nested to any depth | `pk-dock` does dock/tab/split/collapse/float; a panel may itself contain a dock (slotted node) | Stack of top and bottom rail groups; nesting is untested and undocumented; a dock inside a dock must resolve fill/overflow/persist keys | section 3 |
| 4b | Tab sets of any size with overflow | `pk-tabs overflow="menu"` exists; a dock **group's** strip is its own render in `dock-render.js` and does not take `overflow="menu"` | Group strip overflow parity | section 3, step 4 |
| 4c | Panel hosts instance list with own toolbar (terminal sessions); panel header actions (add, split, maximise, close) | A dock panel header has only the Panel menu, Collapse, Close; no slot for actions; no maximise | `actions` slot on the panel header; `maximize` | section 3, step 4 |
| 4d | Activity rail with stacking top/bottom groups | `pk-side-nav` rail is one list; dock rail is a collapse target, not a navigation list | Rail group presentation of a tab group | section 3, step 3 |
| 4e | Status bar | `pk-toolbar` is a lead plus actions row; dock has no edge strip | A documented composition: a `pk-toolbar` (or `pk-cluster`) outside the dock, at the shell's footer slot | section 3 (no change) |

## 3. The composition model

Principle (consolidate controls first, `core/STANDARDS.md`): **the workbench is data, a dock layout JSON plus slotted panels.** There is no `pk-workbench`, no `pk-ide-shell`, no `pk-activity-bar`. The builder app, and any other tool, declares panels and a layout.

Check recorded against "consolidate first" (the owner asked for it in the spec): `pk-workspace` is rejected as a base because it is fixed (nav/main/aside), `pk-tray` because it is one floating panel, `pk-app-shell` because it is a page frame whose header, nav and footer are slots that **host** a dock (it is the frame around the workbench, not the workbench). `pk-dock` is the only existing element whose model is a free tree.

How each region of the VS Code reference maps (the hard test case; an arrangement, not a template):

| VS Code region | Composition from existing elements |
| --- | --- |
| Whole window | `pk-app-frame`/`pk-app-shell` with `flush` + `contain`; the header slot holds menus; a **status strip** in the footer slot (a `pk-toolbar`: left lead, right actions) |
| Activity bar (icons, top group and bottom group, folds as it shrinks) | A dock **tab group with `rail` presentation** (extension A): the group's panels render as an icon-only vertical strip; two such groups, `start` and `end` anchored, stack as a flex column with the end group `margin-block-start: auto`; when the column is too short the end group overlaps/folds (reuse of the `pk-tabs overflow="menu"` collapse logic on the vertical axis). Selecting an icon activates the paired side-bar panel (a normal `pk-tab-change`) |
| Side bar | A dock panel in the left group, collapsible to the rail with the existing flyout |
| Editor area (tabbed, splittable) | The centre dock group(s); splitting is already drag-to-edge; each tab is a slotted panel, closable |
| Bottom panel with 6 tabs | A bottom dock group; its strip needs `overflow="menu"` parity (extension B); the six panels are slotted nodes |
| Terminal tab with an instance list at the right, new/dropdown/more/maximise/close | The Terminal panel's content is a `pk-splitter` (start: the output; end: a `pk-list`/`pk-tree` of instances, fixed `size`); its toolbar is a `pk-toolbar` with `pk-button`, `pk-split-button`, `pk-dropdown`; header actions via extension C |
| Nested to any depth | A panel may contain a `pk-dock`, `pk-tabs`, `pk-splitter` or another panel tree: the host owns slotted nodes, the dock only slots them (STANDARDS, "Ownership and reactivity"); nothing in the dock reaches into a panel |

Small extensions (each is a prop, slot or flag, with a Blazor mapping entry and browser cases; none is a new tag):

- **A. `pk-dock` group `rail` presentation**: a group-level attribute in the layout JSON (`{ type:'tabs', presentation:'tabs' | 'rail' }`, default `tabs`). `rail` renders the group's strip vertically, icon-only (the icon is a new optional `data-icon` on the panel, name kept as `aria-label`/tooltip), with `start`/`end` anchoring. Phone behaviour is unchanged (one tab strip). About 90 lines in `dock-render.js` (a lazy-loaded part of `plainkit.dock`, so `dock.js` itself does not grow).
- **B. Group strip overflow**: the dock group's strip uses the same measurement as `pk-tabs overflow="menu"` (shared helper extracted from `tabs.js`, not duplicated; if extraction is not possible within budget, the group strip embeds a real `pk-tabs overflow="menu"`, which is allowed because dock is `tier: component` and tabs is `component`, C1 holds). About 60 lines.
- **C. Panel header actions and maximise**: an optional slot named by convention on a panel, `data-actions="<id of a toolbar element>"` is rejected (it would make the dock read foreign content); instead the panel's own first child `[slot="<id>"] > [data-panel-actions]` is not moved but **slotted into the header through a second slot per panel** (`<id>-actions`), declared by the host the same way as panels. A `maximize` panel operation (a layout flag `maximized: <panelId>|null`, validated, one `pk-layout-change`) hides siblings and restores on toggle. About 80 lines plus model ops. (This is the `pk-dock-panel` wrapper idea from #432 step 12: if the owner prefers it, the same two features land as a `pk-dock-panel` element, but the check says a slot pair on the existing slotted panel is enough.)
- **D. No status element.** A documented pattern.
- **E. No instances element.** `pk-splitter` + `pk-list` + `pk-toolbar` is the pattern; a bindings-driven "instance list" is the builder's concern (section 7), not an element.

What is explicitly **not** new: dock model, splits, tab groups, collapse/rail/flyout, floating, persistence, drag-to-dock, undo history, phone strip, `pk-tabs` overflow, `pk-splitter`, `pk-tray`, nav rail, app shells, `pk-toolbar`, `pk-context-menu`, `pk-tree`.

Budget: A, B, C go into `plainkit.dock`'s lazy parts (`dock-render.js` and a new `dock-rail.js`), measured against the dock override with a ledger entry per the size review (row "lazy feature chunk", default 2 KB gzip each). No ceiling is raised by this spec; if a measured chunk exceeds its ledger entry the step stops and says so (AGENTS.md).

## 4. The builder's app structure

- **Entry**: a standalone page `core/site/layout-builder/` (today only the gallery module `core/site/modules/layout-builder.js` exists; this makes it an app of its own): `mountApp` with `defineModule`s, using `pk-app-frame` without the gallery nav. Same code mounts as one module in a host that wants it (`mountLayoutBuilder` stays, it becomes the thin wrapper that mounts the app into a container).
- **Shell**: a `pk-app-shell flush contain` whose body is one `pk-dock fill persist-key="lb"`. Menus (File, Edit, View, Panels) in `toolbar-start`. Status strip in the shell footer: selection path, validity count, mode (design/preview), runtime connection.
- **Arrangement (default layout JSON, one arrangement among many)**:
  - left `rail` group: Palette, Structure, Outline, Assets (icons); left side panel group shows the active one;
  - centre group: Canvas | HTML | JSON | Preview (iframe device preview, `DESIGN.md` section 3) as tabs, splittable;
  - right group: Properties, Styles, Bindings;
  - bottom group: Problems, Console, Events, Scripts, Terminal (overflow menu), Terminal tab = instances list.
  The user can rearrange all of it; the layout persists (`persistKey`) and is exportable as the builder's own JSON (a "workspace layout", separate from the page document).
- **Panels are modules**: each panel is a lazily imported function `{ id, heading, icon, mount(el, ctx) }` (the `mountToolDock` panel shape from the tool-dock spec, reused so `mountDevTools` panels can sit in the same dock), so the cold start only loads the canvas and the visible panels. A hidden tab's module is not fetched until first shown (the `lazy` idea from #590 realised at the app layer, no dock change).
- **State**: one document store (the existing model plus history), one selection, one `bindings` registry; panels subscribe (events), nothing is shared by DOM reach-in. The builder stores nothing itself except an unsent draft and the layout; the host owns persistence (`DESIGN.md` section 4).
- **Blazor**: stays a thin wrapper (`PkLayoutBuilder` mapping, no logic); the Razor exporter remains a host hook.

## 5. Nesting, drop targets and the palette

### Drop-target model

Every node in the canvas model has, from `api.json`, a list of **drop zones**: its default slot and each named slot (`header`, `footer`, `media`, ...). A zone accepts a child tag if (a) the element declares the slot, (b) the HTML content model allows it (already checked by `layout-validate.js`), and (c) the palette entry is a valid child (an optional `parents`/`children` hint in `meta.json`, see below). Rules:

1. Dragging a palette entry or an existing node shows an insertion indicator in the deepest zone under the pointer (hit test by geometry, innermost wins, `Alt` held selects the parent zone). Indicators are drawn by the builder's overlay, **not** by wrapping nodes in `pk-sortable-item`, which keeps the `::slotted()` stylesheets intact (the constraint recorded in #174).
2. Keyboard remains complete: the Move menu and Alt+arrows stay the reference; drag is the pointer shortcut. A new "Insert into..." submenu lists valid zones of the selection (also the touch path and the screen-reader path).
3. Moves are `moveNode(id, targetId, slot, index)` in `layout-ops.js` (exists as move/insert; a slot argument is the addition), refused with a problem if it would create a cycle or violate limits (depth 32, 5000 nodes).
4. Empty containers show a visible drop affordance in the canvas overlay only (never in exported markup).

### Palette grouping (revised)

The palette stops using the gallery `group` field (which exists for the documentation and mixes concepts). Three declared kinds, from the existing `tier` plus one new `meta.json` field `builder` (a small object, `{ "kind": "container"|"leaf"|"page"|"shell", "slots": [...] }`, default derived: has a default slot and `tier` element/component = `container`, otherwise `leaf`):

| Palette group | Contents (examples) | Why |
| --- | --- | --- |
| **Containers** (real, accept children) | `pk-stack`, `pk-cluster`, `pk-grid`, `pk-container`, `pk-card`, `pk-accordion`, `pk-tabs`, `pk-splitter`, `pk-fill-column`, `pk-frame`, `pk-list-group`, `pk-detail-layout`, `pk-form`, `pk-field-row`, `pk-toolbar`, `pk-drawer`/`pk-dialog` body | Slots and children are the point |
| **Content** | native text, `pk-heading`, `pk-text`, `pk-media`, lists, tables | leaves of content |
| **Controls, display, feedback, navigation, overlays** | as today | unchanged grouping by function |
| **Page constructs** (exactly one per page, own regions) | the page types (`pk-list-page`, `pk-record-page`, `pk-settings-page`, ...), `pk-page-shell`, `pk-page-header` | They are the page-types "construct" of #1929 (frame regions, one data source, shared lifecycle), not freely nestable: inserting one replaces the root, and their regions are fixed slots |
| **App frame** (document level, not droppable inside a page) | `pk-app-shell`, `pk-app-frame`, `pk-workspace`, `pk-dock`, `pk-tray` | They own the page frame and the viewport; the canvas shows them as the page root only, otherwise they escape the inert canvas (`DESIGN.md` section 3) |

Open: the exact list needs the page-types audit on main (#1929 step 1). Until then the field defaults to the derived rule, so no `meta.json` has to change for steps 2 and 3, and an element can opt in later.

## 6. Declarative bindings: events, properties, styles

### 6.1 Model addition

Per node, an optional `bindings` key (the reserved `bind` idea of `DESIGN.md` section 2, now defined; `version` becomes 2, `fromJson` upgrades 1 to 2 by adding nothing):

```jsonc
{ "id": "n4", "tag": "pk-button", "props": {"variant": "primary"}, "slots": {"": ["Toggle"]},
  "name": "toggleBtn",                        // optional stable handle, unique in the page
  "on": {                                       // event name -> ordered list of actions
    "click": [ { "do": "set", "target": "#side", "prop": "collapsed", "value": "toggle" } ]
  },
  "style": { "--pk-card-radius": "var(--radius-3)", "--color-accent": "var(--color-info)" }   // tokens and hooks only
}
```

### 6.2 Actions: a closed verb list, no code

`set` (property or attribute on a target: literal, `toggle`, or from the event detail), `call` (an element's public method with literal arguments, allow-listed by `meta.json` `methods`), `emit` (dispatch a `pk-*` event on a target), `navigate` (same-origin safe URL, `safe-url.js`), `toast`/`open`/`close` (existing `pk-toast`, `pk-dialog`, `pk-drawer` invokers), `run` (a named command registered by the host, section 7), and `if` (one comparison of two bindable values, no expressions). Targets are `#name` handles, `self` or `closest(<tag>)`. Event names and property names are validated against `api.json` exactly like props today (real event, real prop, enum values, types).

Everything is data. The runner interprets it; there is no `Function`, `eval`, `import()` of user text or string handler. This is the same model as the declarative openers (#20: `command`/`commandfor`) and `pk-action {key}` of the page-actions model (#1943); `set`/`call` on `command`-style attributes is emitted as plain attributes when the platform has one (zero runtime), otherwise by the runner.

### 6.3 Styles (CSP-safe)

The inspector's Styles panel offers only: the element's `cssProperties` from `meta.json` (`--pk-<element>-<part>` hooks, already the public styling contract and declared per element), and the global tokens (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`) as pick lists with the token's value shown. Values are validated: a token reference (`var(--space-4)`) or a value in the hook's declared type; no raw colours or ad-hoc lengths (the tokens-only rule), refused with a problem otherwise. Raw values are possible only as a visible, opt-in "custom value" that the exporter flags.

In the canvas, the builder applies them with a constructable stylesheet / `adoptedStyleSheets` rule keyed `[data-lb-id="n4"]` (no `style` attribute; allowed by `style-src 'self'`, the same mechanism the theme editor uses; confirm in step 6's browser case with the site CSP).

### 6.4 Export format

`toHtml` stays pure markup. An export becomes a **bundle of three static files**, all CSP-safe:

1. `page.html`: the markup, each styled or bound node carries `data-pk-id="toggleBtn"` (a generated stable class/handle), no `style`, no `on*`.
2. `page.css`: `[data-pk-id="toggleBtn"] { --pk-card-radius: var(--radius-3); }` (hooks and tokens only).
3. `page.bindings.json` plus a script tag `<script type="module" src="./pk-bindings.js">`: the **same** runner the canvas preview uses, shipped as an SDK file (`js/bindings.js`), which loads `page.bindings.json` and attaches listeners. Pages with no bindings include none of it.

Blazor: the Razor exporter maps `on` to `@onclick` style events for native elements and to `PkX`'s EventCallback parameters, in the host hook; the declarative `set`/`call` actions become component state in the generated page. This is a host exporter concern and does not change the core.

Round trip guarantees extend: `fromJson(toJson(doc))` equals `doc` including `on`/`style`; `fromHtml(toHtml)` recovers markup and, given the bundle, bindings and styles; hostile bindings JSON (unknown verb, unknown target, `javascript:` URL, over-long list) is refused with problems, never executed. Limits: 32 actions per event, 200 bound nodes, 10 000 characters per value.

### 6.5 Authoring UI

A **Bindings** panel (an accordion per selected node: "When [event] -> [action] [target] [property] [value]") built from `pk-select`, `pk-input`, `pk-field`; a **Styles** panel (a `pk-accordion` of hook groups with `pk-colour-input`/`pk-select`/`pk-unit-input` for the allowed token types). Live in the canvas: bindings run in an **interactive preview mode** (a toggle, off by default, design mode keeps the canvas inert), using the real runner on the real elements, so "button click toggles collapse" is testable without leaving the builder.

## 7. The terminal and scripts panel

Split by what must be real:

| Capability | Declarative / core | Needs a runtime |
| --- | --- | --- |
| Event -> action/property/style wiring | yes (section 6) | no |
| Console panel showing logs, events, problems | yes (`console-logic.js`, `log.js`) | no |
| **Command line over the builder's own API** (`select n3`, `set n3 collapsed true`, `insert pk-card into n1`, `export html`, `validate`, `run <command>`, `help`) | yes: a tokenised command table dispatching to `layout-ops.js` and the bindings runner; history, completion from `api.json`; output as structured lines | no |
| Test commands that exercise the built page (`click #toggleBtn`, `expect #side collapsed`, `wait pk-tab-change`) | yes: a small scripted-test vocabulary over the preview mode (real DOM events, assertions on props), a `.pkscript` text format parsed by us | no |
| A shell (git, node, dotnet, npm), arbitrary JavaScript, a language server | no | **yes** |

Under `script-src 'self'; style-src 'self'` the page cannot evaluate typed code (the console module's header states it, `security.allow.json` counts sinks). The options for the real runtime, in order of recommendation:

1. **Local dev host (recommended first).** A small Node program (`plainkit-host`, shipped in `plainkit.tools`, no runtime dependency on the page) that serves the builder, and exposes a loopback-only WebSocket (`127.0.0.1`, random port, **per-launch token in the URL fragment and checked on every message**, Origin check, no wildcard CORS) that spawns a PTY or runs allow-listed tasks and streams output. The page connects with `connect-src ws://127.0.0.1:<port>` added by the host to its own CSP header (a documented, opt-in CSP line, not a relaxation of `script-src`). The terminal panel renders output into a `pk-log`-style list (and a text input), **not** `eval`. Instances (the terminal tab's instance list) map 1:1 to sessions on the host.
2. **Blazor Server / app server.** The server side exposes the same command channel over SignalR (the server already is the trusted runtime); the Blazor `PkTerminal` wrapper is just a client. Same protocol.
3. **In-browser sandbox (later, optional).** A WebAssembly shell/JS interpreter in a sandboxed same-origin worker needs `worker-src 'self'` plus WASM compilation (`'wasm-unsafe-eval'`, which the site CSP does not allow) or a sandboxed cross-origin iframe with its own CSP; both widen the security surface, so this is **not recommended** and out of scope.
4. **Never**: `eval`, `new Function`, `unsafe-inline`/`unsafe-eval`, or a remote runtime reached with a user's code and no authentication.

Protocol (one JSON message per frame): `{ "t": "spawn"|"input"|"resize"|"kill"|"list", "id", ... }` and `{ "t": "data"|"exit"|"sessions", ... }`; the client never receives a way to run code in the **page**, only text to display (written with `textContent`). Sequences are stripped to a safe subset (colour, no OSC hyperlinks or title writes) before display.

Security notes: the loopback socket is the whole trust boundary, so token + Origin + loopback bind are all required, and the host refuses to start the shell channel when bound to a non-loopback address; the shell inherits the user's environment, so it is **off unless started with `--terminal`**; commands from a bindings `run` action are only names from a registry the host app supplies, never free text from a saved page (a page file cannot start a process); the exported bundle contains no terminal code; logs go through the SDK logger (no bare `console.*`, no silent catch).

## 8. Constraints checked

- **Consolidate first**: section 3 (no new tag; three flags/slots on `pk-dock`; patterns for status bar and instances).
- **Ownership/reactivity**: panels are host-owned slotted nodes; the dock never writes inside them. New `pk-dock` writes (rail attributes) are declared in `meta.json` `writes`; subscriptions outside the element's subtree go in `connected()`/`disconnected()`; no base-class hooks.
- **CSP**: no inline script/style/handler, no eval; bindings runner is a static file; styles via adopted stylesheets and exported CSS; websocket only by explicit opt-in `connect-src` to loopback.
- **Tiers**: `pk-dock` (component) composes `pk-tabs`, `pk-splitter` (element/component, lower or equal); the builder module is a module (not an element). C1 and C4 untouched.
- **Budgets**: nothing raised; new code is lazy (`dock-rail.js`, `bindings.js`, panel modules) with ledger entries; core packed ceiling untouched. If the groups strip needs more than the dock override allows, move code out (the `dock-*` lazy files already exist for this).
- **Blazor thin**: mapping entries with `extra: true` for the new dock props; the terminal/bindings runtime live in core; `PkLayoutBuilder` has no logic.
- **Only existing `pk-*`**: yes; any gap goes to #336 first.
- **Privacy**: spec uses no real paths or addresses (`127.0.0.1` is the loopback literal).

## 9. Phased plan (each step a releasable PR of about 400 lines or less)

| # | Step | Measuring cases (written first, shown failing on old code) |
| --- | --- | --- |
| 1 | **Builder as an app**: add `core/site/layout-builder/` as its own page with `pk-app-shell flush contain` + a `pk-dock fill` filling the viewport; the gallery module becomes a link. | Browser: at 1280 and 375 the dock rect equals the viewport minus the header (1 px); no gallery nav in the DOM; layout persists across reload. UI review scenario for the frame. |
| 2 | **Nested drop targets**: zones per slot at any depth in `layout-builder-logic.js`/`layout-ops.js` (`moveNode` with slot), overlay indicator, "Insert into..." menu. | Browser: drag a card into a stack inside a card's `footer` slot; reorder inside a container by pointer; cycle refused; node tests for ops and a property test (random moves keep the model valid). |
| 3 | **Palette regrouping** from derived kind (containers, content, page constructs, app frame) and the optional `meta.json` `builder` field. Needs #1929 step 1 or the derived rule. | Node: every `api.json` element lands in exactly one group; page constructs are refused as children; browser: palette order and search. |
| 4 | **Dock groups: overflow parity + header actions + maximise** (extensions B and C). | Browser: six-panel bottom group at 600 px shows the menu button, selected tab pinned; header action in a panel; maximise hides siblings and restores the exact layout; model property test. |
| 5 | **Dock rail presentation** (extension A) and the VS Code arrangement as a gallery example of `pk-dock`. | Browser: two stacked rail groups, the end group at the bottom; fold at a short height; activating an icon changes the side panel; the whole reference arrangement as a measuring test (rects of rail, side bar, editor, bottom panel, status). |
| 6 | **Bindings model and runner**: model v2 (`on`, `name`), `js/bindings.js` with the verb list, validation, interactive preview mode, Bindings panel. | Node: round trips with hostile inputs; browser: a real mouse click on a built `pk-button` toggles `collapsed` on a `pk-side-nav`; design mode stays inert. |
| 7 | **Styles**: `style` map on nodes, Styles panel from `cssProperties` and tokens, adopted-stylesheet canvas, bundle export (`page.html`, `page.css`, `page.bindings.json`). | Node: no `style` attribute anywhere in exports; token-only refusal; browser under the site CSP: a hook change is visible and no CSP violation is logged. |
| 8 | **Command panel (declarative)**: console input over the builder's command table, `.pkscript` test vocabulary against preview mode, Problems/Events panels in the bottom group. | Node: command parser and dispatcher; browser: `click`/`expect` script passes and fails with a readable line. |
| 9 | **Runtime bridge**: `plainkit-host` loopback channel, token and Origin checks, terminal panel with an instance list (spawn/switch/kill), Blazor Server client later as its own step. Possibly split in two. | Node: host rejects a wrong token, a wrong Origin and a non-loopback bind; protocol tests; browser: two sessions, switch, close, output rendered as text only (a hostile escape sequence is neutralised). |

Steps 1 to 3 are independent of the dock work and can ship first; 4 and 5 are dock-only and useful to any consumer; 6 and 7 deliver requirement 3a/3b; 8 and 9 deliver 3c.

## 10. Open questions for the owner (with a recommendation each)

1. **Is the builder app a standalone page, a module usable in a host, or both?** Recommend both: one mount function, a standalone page as the primary entry.
2. **`pk-dock-panel` element or a slot pair on the existing panel for header actions?** Recommend the slot pair (no new tag, consolidation); revisit if more per-panel options accrue (#432 step 12).
3. **Rail as a group presentation of the dock, or as a mode of `pk-side-nav`?** Recommend the dock (it is panel navigation, not site navigation); `pk-side-nav` stays the app's route nav.
4. **Bindings verbs: is the closed list above enough for v1?** Recommend yes; add `if` last, no expressions ever; a script field stays out.
5. **Where does the real runtime live first?** Recommend the local dev host; Blazor Server as a second client of the same protocol; no in-browser eval.
6. **Package home**: stay in `plainkit.tools` as a lazy module, or move builder/IDE elements to a separate package as the size review proposes (its step 5)? Recommend staying until the size review's question 3 is decided; do not rename `plainkit.ide` (it is editor metadata).
7. **Do exported bundles ship the bindings runner as an SDK file or inline-free generated code?** Recommend the SDK file `js/bindings.js` (auditable, CSP-safe, shared with the preview).
8. **Raw (non-token) style values**: refuse entirely, or allow behind a flagged custom value? Recommend refuse in v1 (tokens-only is the repo rule).
9. **Is `meta.json` `builder` metadata acceptable**, or must grouping stay purely derived? Recommend derived first, the field only where the rule misfires.
10. **Order**: do steps 1 to 3 (nesting, app) before the dock extensions? Recommend yes: they fix the owner's visible complaints with no new element.

## 11. Risks

- **Dock budget**: the dock element sits near its override (4,037 B vs a 3.65 KB override in a stale dist). Mitigation: extensions live in lazy `dock-*` files; if one cannot, the step stops and reports instead of raising a number.
- **Nested docks**: persist keys, fill-height and focus restore across two docks are untested; step 4 adds a nested-dock case before relying on it.
- **Drop precision** on deeply nested or tiny containers; mitigated by the `Alt` parent-zone key and the "Insert into..." menu (the keyboard path is the reference).
- **Bindings scope creep** toward a programming language; the closed verb list and the `.pkscript` format are the guard, and any addition needs an owner decision.
- **Terminal security** is the largest risk: an unauthenticated local socket is remote code execution for any web page. Token, Origin, loopback-only and opt-in are all mandatory, with tests, and a security review before step 9 merges.
- **Blazor parity**: bindings are runtime-only in the page; a Razor export of actions is a host concern and may lag; stated in the export docs.
- **Page-types audit dependency** (#1929): palette regrouping may need to wait for its step 1; the derived rule is the fallback.
- **Premise check**: `plainkit.ide` is editor metadata, so any plan that put runtime code there would break the package's meaning and its ceilings.
