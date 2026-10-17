# pk-code-view: header, actions and fill mode (refs #1523, #336)

Status: proposal for owner decision. Research and design only; no product code.

## 1. Evidence on main

- `pk-code-view` (tier `element`, `core/elements/code-view/`, about 4.4 KB js, 1.9 KB css) is a read-only, line-numbered listing: props `lines`, `segments`, `start`, `highlight`, `label`, `maxHeight`; event `pk-line-click`; no slots; parts `body`, `rows`. It already fills a flex parent (`:host` is a flex column, body `flex: 1; min-block-size: 0`), so the "fill" need is only partly missing.
- `pk-code-block` (tier `element`) already has a header bar: `label`, a Wrap toggle (`pk-wrap-change`), a Copy button (`noCopy`, `pk-copy`, a `status` live region) and `maxHeight`. It is built from native `<button>`s, which is legal in tier `element` (C4 forbids only rendering `pk-*`). It has no line numbers, line highlighting, segments or `pk-line-click`.
- The one real consumer, `core/modules/code-explorer/element.js` (line 421), hand-builds a header above the view in a `pk-stack`: path (mono, semibold), a language `pk-badge`, a line count, Outline and "Usages of X" `pk-button`s, a "Showing lines a-b of n" note, then `<pk-code-view label=path>`. This is the gap: every code-viewing consumer would repeat that header. Other uses: the gallery sample, `core/tests/review/scenarios/code-view.js`.
- Blazor: `blazor/mappings/code-view.json` exists (generated wrapper).

## 2. Header: what it holds, slot or attribute

Recommendation: attributes for the common case, slots as the escape hatch.

- Attributes: `label` (exists; region name, becomes the header title when `header` is set), new `language` (short plain text tag) and `header` (boolean). Without `header` the element is exactly what it is today, so nothing regresses. A line count ("n lines") is derived from the rows and shown by default in the header.
- Slots (drawn only with `header`): `header-start` (after the title, for the consumer's own `pk-badge` / `pk-text`) and `actions` (right side; consumers slot `pk-button size="mini" variant="ghost"`). Slotted content is host-owned light DOM; the element only places it (Ownership and reactivity).
- Why not an `actions` data prop: the code explorer's actions are labelled buttons with their own handlers and `hidden` state, which slotted `pk-button` already gives; a JSON prop would reinvent button and event wiring. This matches `pk-card`/`pk-page-header` in the SDK and comparable libraries (Shoelace card header slots, GitHub file header, Starlight/Docusaurus code-block title bars; Ant `extra` and MUI `action` take nodes too).

## 3. Built-in actions

Smallest useful set, aligned with `pk-code-block`:

- `copy` (boolean, opt-in so the existing API is unchanged): a native `<button part="copy">` copying the whole text (lines joined by `\n`), with `pk-copy` and a polite `status` region as code-block. The line numbers are CSS generated content, so they are not copied. Whole file only; a native selection copy already works.
- No `wrap`: rows are `white-space: pre` with a sticky gutter, and wrapping breaks the row/gutter model. Wrapped snippets are `pk-code-block`'s job; document the split ("code-block for a snippet in a page, code-view for a navigable file").
- Everything else (Outline, Usages, Open, Download, Go to line) is a consumer action in the `actions` slot. No built-in download or search.

## 4. Fill mode

Boolean `fill`: the element takes the full block size of its container; the header stays put and the body scrolls inside, both axes. CSS only: `:host([fill]) { block-size: 100%; min-block-size: 0; }` and `maxHeight` is ignored. Without `fill` it keeps content height up to `maxHeight`. "fill" is the word `pk-stack fill` and the code explorer already use, so no new vocabulary.

## 5. Tier (rule C4) and size

- Stays tier `element`: the header is native `div`/`span`/`button` (as `pk-code-block`), and the `actions` slot only receives the consumer's `pk-button` (slotted children are allowed by C4). Promoting to `component` to render `pk-button` itself would break C1 for element-tier consumers and add weight for no gain.
- Estimate: about 0.5 KB gz js and 0.3 KB gz css in the element's own files; no lazy chunk. The copy/clipboard code is extracted to a shared `core/js` helper used by both code-block and code-view, which keeps both within budget. Budgets are not raised; if over, shrink or move out.

## 6. Blazor

`blazor/mappings/code-view.json` gains `Header`, `Language`, `Fill`, `Copy` (bools/string), event `pk-copy` as `OnCopy`, and slots `HeaderStart` and `Actions` as `RenderFragment` (as `PkSplitter` maps `start`/`end`). Generator only, no hand-written code.

## 7. Accessibility

- Header is a `role="group"` named by `label`; the listing keeps its `region` role and name. The title is not a heading (it is a file name) unless the consumer slots one.
- Copy: native button with a visible text label, status announces "Copied" or "Copy failed", focus ring from the token, `--touch-target` on coarse pointers.
- Phone: header wraps; slotted `pk-button collapse="phone"` already collapses to icons (aria names kept), per the icons-by-form-factor rule. Body keeps `tabindex=0` for keyboard scrolling. Tokens only, CSP-safe.

## 8. Tests

- Node (`code-view.test.mjs`): no header without `header`; `language` and count render; slots placed; `copy` writes the joined text, fires `pk-copy`, sets status.
- Browser cases (before the CSS): `fill` in a 300px flex parent gives a 300px host and an unmoved header rect after scrolling the body 500px; at 375px the header and actions do not overflow.
- Scenario `core/tests/review/scenarios/code-view.js` extended: header with actions, fill in a bounded container, phone, light and dark.
- `element-surface.test.mjs` and `tiers.test.mjs` stay green with no baseline change.

## 9. PR-sized steps

1. `fill` + CSS + browser case + docs/gallery sample (about 60 lines).
2. `header`, `language`, line count, `header-start` and `actions` slots, Blazor mapping, scenario (about 200 lines).
3. `copy` + `pk-copy` + status + shared clipboard helper (about 120 lines).
4. Consumer step: the code explorer uses the new header and drops its hand-built one.

## 10. Decisions for the owner

1. Header via `header` + `label`/`language` attributes + `header-start` and `actions` slots with slotted `pk-button`: recommended yes.
2. Built-in actions: only opt-in `copy`; no wrap, no download: recommended yes.
3. `fill` = fill the container's block size, body scrolls inside, CSS only: recommended yes.
4. Stay tier `element` (native header markup): recommended yes.
