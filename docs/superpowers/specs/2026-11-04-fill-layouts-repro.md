# Fill layouts and static nav: reproduction and measurements (#1878, #1675)

Measured on main at 1ab4c214 (headless Chromium via `scripts/ui-review.mjs` scenarios, 1280x900 desktop, 375x812 phone). The temporary scenarios are not kept; the numbers below are the record.

## Finding zero: #1675 is already shipped

Both asks of #1675 exist on main: `pk-app-shell[contain]` (named inline-size container `page`, clips sideways, one slotted child fills; #1707) and `pk-fill-column` (#1795, tier `element`, `fixed` + `gap`, 0.9 KB gz). What is left of the issue is what they do NOT cover, measured below.

## 1. #1878: the "369 px" static nav

Setup: static slotted `pk-doc-page` (`<pk-side-nav slot="nav">` + article) and `pk-master-detail-page` (`<pk-side-nav slot="list">` + `slot="detail"`).

| case (desktop) | host height | side-nav height | position | scrolls itself |
| --- | --- | --- | --- | --- |
| doc-page, 10 items, 4-paragraph article | 378 | 378 | static | no (inner scroll 329 = content) |
| doc-page, 40 items, 4 paragraphs | 1323 | 1323 | static | no |
| doc-page, 40 items, 60 paragraphs | 2239 | 2239 | static | no |
| master-detail, 10 items | 406 | 378 | static | no |
| master-detail, 40 items | 1351 | 1323 | static | no |
| doc-page in app-shell body, 12 items, body scrolled 800 | | y 70 -> -730 | | nav scrolls away with the page |

There is no fixed 369 px: the nav is exactly as tall as the taller of (its own content, the article). 369 is a ~10-item nav (49 px brand row + ~31.5 px per row + padding); the gallery example produces roughly that.

Why: `pk-side-nav` is built as an app-chrome column (`side-nav.css`: `:host{display:flex;flex-direction:column;overflow:hidden;width:var(--shell-nav-w)}`, inner `[part=scroll]{flex:1;min-height:0;overflow-y:auto}`). It scrolls itself only when its host has a definite height (as in `pk-app-shell`, 100dvh). `doc-page.css` `[part=shell]{display:flex}` has `align-items: stretch` and no height cap, so the host height is the row height (auto = max of the children), the inner scroller never overflows and nothing is sticky. master-detail puts it in `[part=master]` (grid, `align-items:start`) with the same auto height.

Phone (375): doc-page works (its own Menu button opens the nav as the fixed drawer, #1829). master-detail: the slotted side-nav has no box at all (`@media (--tablet)` makes `pk-side-nav` `position:fixed; transform:translateX(-100%); visibility:hidden`) and master-detail has no Menu button, so the master list is invisible on a phone and cannot be opened. That is a real defect, separate from the height.

Verdict: pk-side-nav is the wrong control for a master list (it is the shell navigation column: fixed width token, drawer behaviour at <=1024, brand row, border). For doc-page it is the right control, and the layout is what is wrong: the static nav needs to be sticky and height-capped. Both need a decision from the owner (#1253 ledger).

## 2. #1675: the three layouts (app-shell body 851 px tall at 900 viewport)

Layout 1, wrapper div around a `pk-list-page` in the body:

| variant | wrapper | list-page | pager y |
| --- | --- | --- | --- |
| direct child (baseline) | n/a | 809 | 841 (visible) |
| wrapper div, no workaround | 4262 | 4262 | 4293 (off screen, body scrolls, header not pinned) |
| wrapper div + `contain` | 809 | **4262** | 4293 (still broken) |
| wrapper div + `:has(> pk-list-page){display:flex;flex-direction:column;flex:1 1 auto;min-block-size:0}` | 809 | 809 | 841 (fixed) |

So `contain` alone does NOT fix the wrapper case: it makes the wrapper fill, but the wrapper is a block, so the list page inside it does not fill. `contain` only helps when the page is the body's direct (single) child, where no workaround was needed in the first place. Its real gain is the named `@container page`.

Layout 2, fixed region above a scrolling list:

- `contain` with two children (card + list-page): both get `flex:1 1 auto`; the card shrinks to 17 px and its content overflows over the list heading (screenshot: "Camera preview" card overlapping the list's top, "Orders" heading lost). Broken.
- `contain` + `pk-fill-column fixed=10rem` with a list-page in the rest slot: the card is correct (92 px) but the list page is 4262 px tall inside `[part=rest]{overflow-y:auto}`, so the whole page scrolls as one: no pinned header, pager at y 4447 (screenshot: Orders heading, search, rows run off the bottom). fill-column suits a plain stack in the rest region (its gallery example), not a filling page type. A page type needs `[part=rest]` to be a flex column so a `--pk-fill-shrink` child can take it.

Layout 3, nav + article with sticky nav: not covered by either feature. Static doc-page in a body: nav is 2239 px tall and scrolls away (y 70 -> -730 after a body scroll of 800). Needs the sticky/height-cap of section 1.

## 3. Consolidation check

- pk-fill-column already exists, so a new element is not on the table; the open question is changing it. Giving `[part=rest]` `display:flex;flex-direction:column` (one declaration) lets a `pk-list-page` (`flex:1 1 auto;min-block-size:0`) fill it. No new prop. Elements stay tier `element`, render no `pk-*`.
- Wrapper case: the wrapper-less answer is that the host should not wrap (use `contain`'s named container, which is the reason for the wrapper). A flag on a generic container cannot reach a host-owned div; `pk-stack[fill]`/`pk-grid[fill]` already exist for authors who need a wrapper (`block-size:100%`, `flex:1 1 0` for grid), so the sanctioned replacement for the host div is `pk-stack fill` in a `contain` body. Worth checking whether `pk-stack[fill]` makes a list-page child fill; stack is flex column so a `flex:1 1 auto` child should.
- Sticky nav: a flag/CSS on the page types (doc-page static nav slot), not on pk-stack/split. Ownership holds: it is `::slotted` CSS in the page's shadow (as the static Menu drawer already is), no writes to the host's nodes.
- pk-split, pk-cluster: no fill semantics; not candidates.

## 4. Byte cost

Measured now: fill-column css 298 B gz / 251 br, js 528 / 434, html 83 / 68 (about 0.9 KB gz total, loaded only on pages that use it). Cheapest options:

- `[part=rest]` flex column: about +20 B gz, in an on-demand element.
- doc-page static sticky/capped nav, e.g. `::slotted` rule with `position:sticky; inset-block-start:0; align-self:flex-start; max-block-size:100dvh` in the wide query: about 120-150 B gz in `doc-page.css` (a page-type chunk, loaded on demand).
- master-detail phone master list (Menu button like doc-page): JS and CSS, a few hundred B gz in the page chunk; or document a plain-list slot.

`core/tests/page-weight.ceiling.json` only covers reference pages button, form and table (18365, 28662, 20340 gz); none include doc-page, master-detail or fill-column, so none is affected. The core packed ceiling (291,492) counts shipped bytes of the package; these edits are tens to low hundreds of bytes and should be checked with `core/tests/package-size.test.mjs` on the real change, not assumed.

## Recommendation

1. Close #1675 as done except two small follow-ups: make `pk-fill-column [part=rest]` a flex column (so a list page fills it) and document that `contain` does not fix a wrapper (use `pk-stack fill` or no wrapper). Add the three layouts as scenarios (this note's numbers) as the regression guard.
2. #1878: do not use `pk-side-nav` for the master-detail static list; decide the control (a plain list of links or a master-list element) with the owner. Separately fix the phone master list being invisible. For doc-page, make the static nav sticky and height-capped in the wide layout (small CSS in the page).
3. No new element, no ceiling change.
