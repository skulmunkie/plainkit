# Plainkit standards

The rules every change to `core/` follows. The tests enforce most of them; this file says why.

## Names

- **Elements**: the tag prefix is `pk-`. The folder is `elements/<name>/` and the tag is `pk-<name>` (the build fails otherwise).
- **Custom properties**: design tokens are plain (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`) and live only in `tokens/tokens.css`. An element's own hooks are `--pk-<element>-<part>` (for example `--pk-button-bg`) and are listed in its `.meta.json`.
- **Attributes and events**: data attributes are `data-pk-*`, events are `pk-<name>`.
- **Blazor components**: `Pk` plus the tag in PascalCase (`pk-alert` is `PkAlert`, `pk-table` is `PkTable`). The SDK's element meta says nothing about Blazor: the name and the parameters live in `blazor/mappings/<name>.json` (`scripts/tests/blazor-mappings.test.mjs` checks them against the meta).

## Styling

- Tokens only: no literal colours in component or element CSS, and sizes come from the space and text scales. Two themes (`data-theme="dark|light"`) and two densities (`data-density`) are token sets, never separate stylesheets.
- The page layer, `dist/plainkit.css` (`tokens/` plus `base/`: base, spacing, typography, table-content, utilities, a11y, in that cascade order), has a 10 KB gzip budget. A tool's own CSS belongs in its module folder and is loaded by the module.
- **Use the named breakpoints, never a literal.** The widths are `tokens/breakpoints.json` (`phone` 640, `tablet` 1024, `wide` 1280; desktop-first, so a rule applies at that width and below). Element CSS writes `@media (--phone)` (or `(--above-phone)`); the build resolves it. CSS the site serves unbuilt (tokens, base, site, modules, samples) cannot use names and writes the named width literally. Scripts use `js/breakpoints.js` (`mediaBelow('phone')`), never `matchMedia('(max-width: 640px)')`. `tests/breakpoints.test.mjs` fails on a literal in element CSS, an unnamed width elsewhere and a literal in a `matchMedia`. A new width is a new name in the json file, not a new number in a rule.
- Use only components that exist in core. If something is missing, list it as a gap rather than building a one-off.

## Modules

- Each tool is a JavaScript module with one entry point, `mountX(container, options)`, that returns a small handle (`destroy()` at least). A custom element wrapper is optional and only added when it is a thin layer over the module (`<pk-gallery>`).
- Source lives in `modules/<name>/` (the gallery in `site/gallery/`); pure logic sits in `js/` so node tests can import it without a DOM.
- No new runtime dependencies. Reuse SDK components; do not rebuild them.

## The dist pattern

`node tools/build.mjs` is deterministic and writes the toolkit's generated files: `plainkit.css`, the element modules, the gallery data and `dist/` (`node scripts/bootstrap.mjs` runs it with the other generators). None of it is committed. `dist/` is self-contained: every runtime URL is built from `import.meta.url`, so the folder works when copied anywhere or served from a CDN prefix. `dist/manifest.json` lists each file with an SRI hash. The build owns `dist/js`: a file there that no source produces is removed, and a test fails if one is left. Never edit generated files.

## Security (CSP)

The whole site runs under `script-src 'self'; style-src 'self'`.

- No inline scripts, inline `style` attributes, `<style>` elements or inline event handlers. Setting styles through CSSOM (`el.style.x = ...`) is fine.
- Every `innerHTML`-style sink is counted and documented in `tools/security.allow.json` with the source of its markup; prefer DOM APIs and `textContent`. Escape every dynamic value.
- No `eval`, no runtime requests to another origin.

## Logging

Nothing in the SDK fails silently. Use `createLogger(scope)` from `js/log.js` (`js/element.js` gives every element `this.log` and `this.warnOnce(key, message, detail)`); never a bare `console.*`. An empty `catch` or `.catch` handler needs either a log call or a one-line comment saying why silence is right (`tests/no-silent-catch.test.mjs` enforces it).

- **Scopes**: `loader`, `invokers`, the tag name for an element (`pk-input`), the module name for a tool (`scorecard`, `code-explorer`, `theme-editor`, `quality`, `performance`), your own name for an app.
- **error**: something the page asked for did not happen and cannot recover (a module failed to load, a run failed).
- **warn**: a mistake the SDK worked around (a bad attribute value that fell back to its default, an unknown tag, a selector that matches nothing, a saved value that could not be read). Say what was wrong and what was used instead. In an element, say it once per instance (`warnOnce`) so a re-render loop cannot flood.
- **Deprecation**: an item that will go is marked `deprecated: { since, remove, message }` in its element meta (element, prop, event or slot; see `tools/element-api.mjs`); the generated module warns once per page through the element's logger (`js/deprecation.js`, imported only by elements that deprecate something, never by the base). Keep it for one minor version, remove it in the release `remove` names.
- **info**: rare, useful milestones an app might want to see. The SDK itself seldom uses it.
- **debug**: lifecycle and expected fallbacks (element defined, connected, a prop changed, a module loaded and how long it took, a tool mounted, blocked storage, an unsupported browser API). Guard anything costly to build with `isLogEnabled('debug', scope)`; the default level is `warn`, so a quiet page prints nothing extra.

## Declarative openers

`data-open="#id"`, `data-toggle="#id"` and `data-close` (`js/invokers.js`) open, toggle and close a `pk-dialog`, `pk-drawer` or `pk-popover`. The three elements install the one delegated listener themselves the first time one connects (`initInvokers(this.ownerDocument)` in `connected()`), so a page that only uses an overlay needs no script and a page without one pays nothing; `initPlainkit()` calls the same idempotent function. A new overlay element calls `initInvokers` from `connected()` and is added to `OVERLAYS` in `js/invokers.js`. Mistakes (an empty, invalid or unmatched selector, a stray `data-close`) are logged by the `invokers` scope.

## Global trigger shortcuts

A global trigger shortcut is a key combo, usually with a modifier, that opens something from anywhere on the page (not the per-widget ARIA
navigation keys of `js/menu-logic.js` — ArrowDown/Up, Home/End, typeahead, Escape — which is a different, already-centralized thing). Every
one Plainkit defines is a named verb in the command-verb registry, `js/shortcuts.js`: `DEFAULT_SHORTCUTS` maps the verb to a predicate
`(KeyboardEvent) => boolean`, and `isShortcut(verb, event, { pageShortcuts, appShortcuts })` is how anything asks "did the user invoke this
verb", resolving a page-level override, then an app-level one, then the registry default. No element or sample checks `e.key` for a global
trigger inline; it calls `isShortcut` (or a thin named wrapper re-exported for an existing importer, like `isPaletteShortcut`). Today's two:

| Verb | Default shortcut | Opens |
| --- | --- | --- |
| `command-palette` | Ctrl+K / Cmd+K | `pk-command-palette` |
| `context-menu` | Shift+F10, or the ContextMenu key | `pk-context-menu`, at the focused element |

## Ownership and reactivity

Plainkit is a vanilla toolkit with exactly one owner of reactivity at any point: the host (a page, or Blazor) owns what an element is given, the element owns what it draws. There is no reactive system to learn and nothing to garbage-collect by hand. `tests/ownership.test.mjs` and `tests/element-surface.test.mjs` enforce rules 3 (the `writes` declaration), 5 and 8 to 10.

1. **Who owns what.** The host owns the element's attributes and its light-DOM children (the markup between the tags, slotted content, `<option>` children). The element owns its shadow tree and its internal state.
2. **Attributes.** An element writes attributes on itself only for props declared with `reflect` in its meta, and lists them there. State for assistive technology goes through `aria()` (ElementInternals), not attributes. The one other exception is a child that assigns itself to a parent's slot (`pk-tab`, `pk-tab-panel`): the parent's meta marks that slot `selfAssigned`.
3. **Light-DOM children.** An element never adds, removes, reorders or rewrites children the host may render. It may read them, and it may create nodes it owns itself: shadow-tree parts, or an element it makes and fills for the caller (`PkToast.show` into a `pk-toast-stack` nobody else renders). A write to a child's attribute or property (a role, an `aria-*`, a `selected` flag) is a coupling between the two elements: keep it to what the element's meta documents in `writes` (`{ target, attributes, why }`: what it sets on which nodes, and whether it is undone; `tests/ownership.test.mjs` fails on an attribute or prop written to a node the element does not own that `writes` does not list) and never to a host-rendered element's own props. The one write to a host-rendered node that remains is `pk-tooltip` setting `aria-description` on its target (an attribute it sets and removes again, never a node or an id): an id in the shadow tree cannot reach the target, and this is the attribute that does.
4. **Two-way values.** While the user interacts, the element owns the value; after the commit event, the host owns it. Every two-way prop (`value`, `open`, `checked`, `selected`, `current`, `expanded`, `page` and the like) has a commit event named in its meta, raised when the user commits a change (a keystroke only when the event says so), carrying the new value in its detail; the meta names it on the prop (`commit`, one event or a list). The element never changes such a prop on its own without that event (a fallback or a restore it makes itself raises it too, not cancelable), and never raises it for a change the host made. A form reset and a browser state restore are the one silent exception, as with native controls: the prop's description says so and `pk-form` raises `pk-reset` afterwards for hosts that mirror values. A prop the user never changes (an identifier, output only) is listed with its reason in `tests/ownership.test.mjs`, which fails on a two-way prop that names no commit event.
5. **Subscriptions outside the element's subtree.** A listener on `document`, `window` or a `MediaQueryList`, a listener on a scroller the host named, a timer that repeats, an observer of a node the element does not own: the garbage collector cannot free these, so `connected()` adds them and `disconnected()` removes them (the module's `destroy()` for a tool). `connected()` runs again when the element is moved, so it must be idempotent: the same function reference, guarded one-time wiring (`if (!this.$w)`), and no timer started for a detached element. A listener on the element itself, its shadow root or its parts needs nothing: it goes with the element.
6. **No GC machinery.** No `WeakRef`, no finalization, no registry of instances, no reference counting. If a subscription needs one of these, it should not exist.
7. **No hidden reactivity.** No signals, effects, computed values, dependency tracking, proxies over props or virtual DOM. State that another element reads is a prop and an event.
8. **The reactive core.** Attributes and properties in, one microtask-batched `render()`, events out. `requestUpdate()` is the only scheduler.
9. **The template engine** stays limited to `{{ prop }}` / `{{ prop|str }}` interpolation and the `data-if` / `data-if-not` attributes. Anything richer overrides `render()`.
10. **The base class does not grow.** `PkElement` calls exactly these hooks on an element: `connected`, `disconnected`, `changed`, `updated`, `onReset`, `onRestore`. A new hook, method or binding feature is a design decision: change this section and `tests/element-surface.test.mjs` together.

### Blazor

11. **Attributes down, events up.** A component renders its parameters as attributes and turns the element's commit event into a parameter callback (`@bind-Value` listens for the change, not for every keystroke).
12. **No JS interop per render.** The generated components and `PkElementBase` make one call, `EnsureInitialized` on the first render, plus explicit methods a caller invokes. A parameter change is a changed attribute, never a call.
13. **Mount components own a container Blazor never diffs.** `PkLogs`, `PkScorecard`, `PkGallery` and the other tools render one empty `<div @ref>` and give it to JavaScript; Blazor never renders children inside it. They mount once and again only when a parameter that changes the tool changes.
14. **The JS side is disposed.** A mount component implements `IAsyncDisposable` and calls `destroy` on the container; the bridge also drops a mount that was still loading when the component went away.
15. **A named slot's host is transparent.** Razor cannot put a `slot` attribute on more than one root element of a `RenderFragment` independently, so the generator (and every hand-written component) wraps one in a `<span slot="...">`. That span carries `class="u-contents"` (`core/base/utilities.css`, `display: contents`, CSP-safe: no inline `style`), so it never breaks a shell/flex host's layout of its slotted content (issue 211). An element that finds a specific partner among its slotted content (`pk-app-shell` finding its `pk-side-nav`) does not use `slotted(name)[0]` alone: the wrapper span is the assigned element, and the partner may sit inside it, not be it (issue 212) — search the assigned elements for the tag, then one level into whichever wasn't a match, the way `pk-app-shell`'s `nav` getter does. `slotted()` itself is not changed for this: only one element needs it today, and the shared base runtime has no room to carry a feature one caller uses.

## Files

- Every file under `core/` is CRLF (`.gitattributes`), the build emits CRLF and tests compare bytes. Never rewrite a whole file with a tool that strips carriage returns.
- A new top-level folder or file must be added to the allowed list in `tests/samples.test.mjs`.
- Nothing in `core/` may name the host application it was extracted from (`tests/carveout.test.mjs`).

## Two repositories in one: SDK and Blazor move together

`core/` (the `plainkit` npm package) and `blazor/` (the `PlainKit.Blazor` NuGet package) are versioned and released together. The Blazor package serves a byte-for-byte copy of `core/dist` (the runtime unit and, under `modules/`, the dev-tool modules unit; each has its own manifest, and the runtime never imports from the modules). After any change to `core/`:

1. `node scripts/bootstrap.mjs`: `node core/tools/build.mjs`, `node scripts/generate-blazor.mjs`, `node scripts/build-skills.mjs` (the agent skills in `core/dist/skills`, generated from the API, the mappings and the samples; it refreshes the manifest), `node scripts/publish-dist.mjs` (copies `core/dist` into the package), in that order. All of it is generated and gitignored; CI runs it first.
2. Update the Blazor wrappers and the element's `blazor/mappings/<name>.json` when an element's API changed, and run both test suites (`node --test "scripts/tests/*.test.mjs"` is the mapping check).

A change that lands in only one of the two is incomplete.

## Tests

`node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs"` from the repository root. A change to an element source, `js/element*.js`, `js/loader.js` or a browser case needs the browser suite re-run (`node scripts/attest-browser.mjs`, see `core/README.md`), because `elements-attest.test.mjs` compares it with the attested report.
