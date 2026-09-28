# Dashboard redesign: tabs + widgets, module composition, pk-card state machine

Status: approved design, not yet planned/implemented.

## Why

`pk-dashboard-page` today is a flat, ungrouped tile grid (`config.tiles`, optional
`config.sections` for headings only). It cannot express:

- Tabs that switch which widgets are visible (two related lists — "these tabs
  trigger this content area" / "these widgets show on this content area" —
  not just headed groups on one scroll).
- A dashboard assembled from more than one module's contributions, the way
  the app shell's nav is already assembled from every active module's `nav`.
- Global filters/context (a date range, a region) that widgets can optionally
  read.

Separately, `dashboard-page.js` hand-rolls its own tile chrome (a bare
`<div part="tile">`) and its own loading/empty/error swap per tile, which is
exactly what `pk-card` plus a state machine would give any consumer for free
— not just dashboards.

## Non-goals

- No new `pk-widget` element. `pk-card` gains the capability instead (see
  "pk-card state machine" below) — confirmed in design discussion: the two
  are the same primitive (titled panel, header/actions/footer/body), and a
  second element with the same chrome would be pure duplication with no
  shadow-DOM composition precedent in this codebase to justify it.
- No change to how routes select page types, `mountApp`, or any other
  built-in page type's config shape.
- No visual redesign of the tile/card look — the existing `pk-card` design
  language carries over unchanged.

## 1. `pk-card`: a `state` machine

New props:

- `state`: enum `ready` (default) `| loading | empty | error`, reflected.
- Existing `heading`/`description`-shaped text for the non-ready states
  comes from new props `stateHeading`/`stateDescription`, or (simpler,
  TBD in planning) a single `stateText` object prop — planning decides the
  exact prop split, not this spec.
- `retry`: a callback property (business logic — never an attribute), shown
  as a Retry action when `state="error"`, same contract as every other page
  type's `retry`.

Template gains one more region, `part="state"`, a sibling of `part="body"`
inside `part="content"`. `updated()` calls
`renderState(this.part('state'), this.state, { label, heading, description, retry: this.retry })`
for every state; for `ready` `renderState` already clears the container (see
`js/page-states.js`), so `part="state"` stays empty and CSS shows `part="body"`
(the consumer's slotted content) instead. Visibility is CSS on the reflected
`state` attribute, the same technique `detail-layout` already uses for its
`part="tabs"`/`part="next"`:

```css
[part="state"] { display: none; }
[part="body"] { display: none; }
:host(:not([state])), :host([state="ready"]) { }
:host(:not([state])) [part="body"], :host([state="ready"]) [part="body"] { display: block; }
:host([state]:not([state="ready"])) [part="state"] { display: block; }
```

(Exact selectors are planning/implementation detail; the contract is: ready
shows body, anything else shows the state region and hides body.)

`heading`/`actions`/`footer` keep behaving exactly as today regardless of
`state` — only the body region swaps. A card used with no `state` at all
(the overwhelming majority of existing usage) is completely unaffected;
`state` defaults to `ready` and every existing test/gallery example/consumer
keeps working with zero changes.

## 2. `pk-dashboard-page` config shape

```js
config = {
  tabs: [{ id: 'overview', label: 'Overview' }, { id: 'sales', label: 'Sales' }], // omit = single ungrouped grid, today's behavior
  widgets: [
    { key: 'revenue', tab: 'overview', label: 'Revenue', kind: 'stat', empty: {...} },
    { key: 'trend',   tab: 'overview', label: 'Trend',   kind: 'chart' },
    { key: 'churn',   tab: 'sales',    label: 'Churn',   kind: 'stat' },
  ],
  sections: [{ heading: 'Key metrics', tab: 'overview', widgets: ['revenue', 'trend'] }], // optional, unchanged grouping-with-heading, now tab-scoped
  filters: [{ key: 'range', type: 'select', label: 'Date range', options: [...] }],       // optional; same shape as list-page's filters
  empty: { heading: '...' }, // shown when widgets is empty (issue #453, already shipped)
}
```

Renames `tiles` → `widgets` (clearer once "tile" would otherwise mean two
different things — a grid cell and a data item). **This replaces
`pk-dashboard-page`'s current implementation outright — no `tiles` alias, no
deprecation window.** Owner decision: build the new shape fresh under the
same tag rather than carry the old flat-grid shape forward as a compatibility
path; this is a breaking change to `config`, called out as `breaking` in the
changelog and the next release notes so consumers update deliberately when
they upgrade.

Widgets with no `tab` (and no `config.tabs` at all) render exactly like
today: one ungrouped grid, no tab strip. This is the fully-backward-compatible
path — a consumer who never touches tabs/filters sees no change beyond the
`tiles`/`widgets` rename.

Each widget renders as a real `<pk-card heading={label}>`, not a bare div:
success appends the `pk-stat`/`pk-chart` into the card's default slot exactly
as `dashboard-page.js` does today (just into a card's slot instead of a
plain box), and the card's own `state`/`retry` drive its loading/error/empty
display — `dashboard-page.js` no longer calls `renderState` itself for tiles,
`pk-card` does that work now.

## 3. Filters and context delivery

`config.filters` renders as a built-in filter bar (page-owned, same shape/
behavior as `list-page`'s own filter panel) above the tab strip / grid.
Current selections live on the page as `this.context` (plain object).

`load(key)` keeps its existing one-argument signature. Because `load` is
already invoked as `this.load(tile.key)` (bound to the page element), a
`load` implementation that cares about filters reads `this.context` itself;
one that doesn't, ignores it. No signature change, no second argument.

Changing a filter re-triggers `load(key)` for every widget that has already
loaded at least once (the active tab, plus any tab visited earlier) — never
for a tab not yet opened (see below).

## 4. Tab loading

A tab's widgets start loading the first time that tab becomes active
(including the initially-selected tab, on mount) — each widget still its
own independent async boundary (`pk-card` state `loading` → `ready`/`error`,
one slow/rejecting widget never blocks or corrupts another, preserving the
per-tile guarantee `dashboard-page` already has, #436). Switching back to an
already-visited tab is pure visibility, no reload. A tab never opened never
fires a single `load()` call.

## 5. Module composition (`defineModule`)

New optional `defineModule` fields, structurally parallel to `nav`:

```js
defineModule({
  id: 'sales',
  dashboardTabs: [{ id: 'sales', label: 'Sales' }],       // optional: declare a tab this module introduces
  dashboard: (ctx) => [                                    // array, or (ctx) => array — same shape as `nav`
    { key: 'churn', tab: 'sales', label: 'Churn', kind: 'stat',
      load: async () => ({ value: ..., tone: 'positive' }) },
  ],
});
```

A widget entry's `load` function is author-written JS living in the
module's own file — not JSON, not transmitted config — exactly like `nav`
already accepting `(ctx) => array`. This is fine precisely because
`defineModule` itself is a module source file, never a wire payload.

New `core/js/app/dashboard.js`, structurally parallel to `nav.js`:

- Walks every active module's `def.dashboardTabs`/`def.dashboard` (same
  "logged once, never fatal" guard `nav.js` already has for a bad/throwing
  function).
- First module to declare a given tab `id` owns its `label`; a later module
  reusing that `id` only contributes more widgets into it — mirrors how
  nothing stops two modules linking into the same route today.
- Strips every widget's own `load` out into one internal `key → loader`
  map, and builds **one** dispatcher function. That dispatcher becomes the
  single `load(key)` property set on the actual `pk-dashboard-page` element
  for whichever route renders page type `dashboard` — the element's contract
  (one `load(key)` callback, `config.widgets` pure JSON) is completely
  unchanged by composition; composition is purely how that one callback and
  that one config get assembled before the page ever mounts.
- Produces the merged `{ tabs, widgets }` config from every module's
  contributed structure, the same size/sanity warnings `nav.js` has
  (`MAX_TOP`/`MAX_ALL`-equivalent) apply here too — planning decides the
  actual thresholds.
- A single-caller (non-composed) dashboard route is unaffected: a route can
  still set `config`/`load` directly, exactly as every other page type does
  today; composition is additive, not a required path.

## Open items for planning

- Exact prop split for `pk-card`'s non-ready text (`stateHeading`/
  `stateDescription` vs. one object prop) — match whatever convention
  `page-states.js` callers already lean toward.
- `dashboard.js`'s exact warning thresholds and message wording (mirror
  `nav.js`'s `MAX_TOP`/`MAX_ALL`).
- Whether `sections` (heading-only grouping within a tab) is worth keeping
  at all now that tabs do most of the grouping work `sections` used to do
  alone — could be dropped in favor of always using `tabs` for grouping,
  simplifying the config shape. Flag for the plan to decide; not blocking
  this spec.
- Blazor mapping updates (`blazor/mappings/dashboard-page.json`,
  `card.json`) for the new props/config fields.
- `blazor/mappings/dashboard-page.json` updated for the new config/props in
  the same pull request (no separate migration path to design — see
  "outright replace" above).
