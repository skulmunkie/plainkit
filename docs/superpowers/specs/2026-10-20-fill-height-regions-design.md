# Fill-height regions and a content-area container (refs #1675)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: #1554 (flex chain / `--pk-fill-shrink`), #1656 (separate packages), tracker #336.

## 1. Problem

Three hand-built layouts in one consumer keep tripping audit rules D8 (styling an element from outside) and D9 (hand-built utility layout):

1. The `pk-app-shell` default slot is wrapped in a host `div` (for `overflow: clip` and a named `container-name`), so a `pk-list-page` inside must be forced to fill with `:has(> pk-list-page) { ... }`. The wrapper breaks the flex chain from #1554 (the body is a flex column; a page type fills only when it is a direct slotted child with `--pk-fill-shrink: 1`).
2. A page with a fixed-height region (a camera preview) above a list that takes the rest and scrolls.
3. A two-column page: a nav list and an article, the nav sticky.

## 2. What exists today (main, 0.19)

- `pk-app-shell` (`core/shells/app-shell`): `[part=body]` is `flex: 1; min-height: 0; display: flex; column; overflow-y: auto; position: relative`. Slotted children get `flex-shrink: var(--pk-fill-shrink, 0)`. Only page types set the variable on their own host (list, filling master-detail/workspace). The body is not a named container, so consumers add a wrapper to get `container-type` or `overflow: clip`.
- `pk-page-shell`, `pk-detail-layout` (`container-type: inline-size`), `pk-grid` (`min`, `columns`, `ratio`, `gap`), `pk-stack`, `pk-cluster`, `pk-splitter`. None offers "one fixed child plus one that takes the remaining height and scrolls"; `pk-grid ratio` is horizontal and does not scroll its cells; `pk-detail-layout` is a record layout, not a generic two-pane.
- No sticky-column primitive. `--pk-page-header-sticky-top` exists only for page headers.

## 3. Proposal

Two new pieces and one small addition.

### 3.1 `contain` option on the shell body (no wrapper)

`pk-app-shell` gets a boolean attribute `contain` (name: Q1). When set, `[part=body]`:
- gets `container-type: inline-size` and `container-name: var(--pk-app-shell-container, page)`, so `@container page (...)` works for slotted pages with no wrapper;
- gets `overflow-x: clip` (y stays `auto`, the body remains the only scroller);
- fills for **any** single slotted child, not only page types: `::slotted(*) { flex: 1 1 auto; min-block-size: 0; flex-shrink: 1 }`. This replaces the `:has(> pk-list-page)` hack, an external selector (D8).

Without `contain` nothing changes. `contain` and `flush` compose.

### 3.2 `pk-fill-column` (tier `element`, base HTML only)

A flex column with definite height (`block-size: 100%`, `min-block-size: 0`):
- children with `slot="fixed"` keep natural height (`flex: none`); the optional `fixed` prop (a length) sets the first fixed region's height (the camera preview);
- the default slot's child takes the rest: `flex: 1 1 0; min-block-size: 0; overflow-y: auto`.

Props: `fixed` (length, default empty), `gap` (token step, like `pk-stack`, default `3`). Parts `fixed`, `rest`. Hooks `--pk-fill-column-gap`, `--pk-fill-column-fixed`. It composes with 3.1: the shell body gives it a definite height, so no wrapper exists in the chain.

### 3.3 Two columns with a sticky nav

No new element. `pk-grid` already makes two columns (`ratio`); add boolean `sticky-first`: the first child gets `position: sticky; inset-block-start: var(--pk-grid-sticky-top, var(--space-4)); align-self: start; max-block-size: 100%; overflow-y: auto`. Alternative in Q3.

### Blazor

`blazor/mappings/app-shell.json`: `Contain` bool (`"extra": true`, #1407, so hand-written files do not grow). New `fill-column.json`: `Fixed`, `Gap`, `Fixed` slot as `RenderFragment`. `PkGrid`: `StickyFirst`. All generated, 1:1.

## 4. Where it lives and budget

- 3.1 is about 6 CSS lines plus one boolean in `app-shell.js`, estimated at most +120 B gzip on the app entry, which is in the page layer (10 KB gzip ceiling, hard cap on the entry graph per #514, never raised). Phase 1 measures it. If it does not fit, the offset is removing a redundant rule in `app-shell.css`/the shell's JS; if there is none, the fallback is to put `contain` in a lazy layer (the container rules in `pk-fill-column`'s CSS), never raise a budget. The static-score baseline is unchanged; phase 1 runs `scorecard-sweep` and reports the delta.
- `pk-fill-column`: new element loaded by tag (lazy), estimated 0.5 KB gzip against the 4 KB element limit; not in the page layer. It stays in core: it is tiny and used by most list-with-header pages, so it does not belong in a separate package (#1656 candidates are the large components).
- Metadata and skill text about 2 KB packed; the package ceiling is not raised (offset via the #1656 dead-weight move).

## 5. Alternatives rejected

- A generic `fill` attribute on every element: spreads layout into 130 elements and fights the tier rules (C1/C4).
- Making the shell body always a size container: changes every consumer's layout (a size container has no intrinsic inline size) and costs layout work everywhere; opt-in only.
- Keeping the wrapper plus a utility class: D9 forbids utility layout, and the wrapper is what is being removed.
- A new `pk-two-pane`: duplicates `pk-grid ratio` and `pk-splitter`.

## 6. Test plan

Browser cases in `core/tests/browser/` (written before the CSS):
- shell with `contain` and a bare `pk-list-page`: list bottom equals body bottom (within 1 px), document does not scroll, at 1280 and 375;
- same with an arbitrary single `div` child: fills;
- named container: `@container page (min-width: 40rem)` applies on the body's width, not the viewport's;
- without `contain`: today's rects unchanged (regression);
- `pk-fill-column`: fixed child height equals `fixed`, rest child bottom equals column bottom, the rest scrolls (`scrollTop` changes) while the fixed child does not move; no `fixed` keeps natural height;
- `sticky-first`: after scrolling the article 800 px the nav top stays within 1 px of its sticky offset; RTL mirrors.
Scenarios `core/tests/review/scenarios/fill-height-camera.js` (preview above scrolling list, scroll steps, shots desktop/phone, light/dark) and `sticky-nav.js`. Node tests for attributes and mapping; audit fixtures proving the new markup passes D8/D9 with no wrapper.

## 7. Phases (about 400 lines each)

1. Shell `contain`, browser cases, scenario, Blazor extra, docs/skills, fragment (about 250 lines).
2. `pk-fill-column`: element, meta, tests, gallery example, mapping, scenario (about 400).
3. `sticky-first` on `pk-grid`, cases, docs; gallery dogfood replacing the three hand-built layouts (about 250).

## 8. Open questions

1. Option name: `contain` vs `content-area` (issue wording). Recommend `contain`: it says what it does; `content-area` reads like a slot.
2. Make `contain` the default after a release? Recommend no (breaking layout); revisit with data.
3. Sticky nav: `sticky-first` on `pk-grid`, or a row mode of `pk-fill-column`? Recommend `pk-grid sticky-first` (one place, ratio already there).
4. Is `pk-fill-column` right given `pk-stack` exists? Recommend yes; a `pk-stack fill` mode would overload stack's never-scrolls contract.
5. If the +120 B cannot be offset in the page layer, accept it? Recommend no; use the lazy fallback.
