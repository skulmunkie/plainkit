# Marketing content blocks: quote, logo strip, CTA band, contact block (refs #1838)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: #1838, tracker #336, #1829 (static slotted pages), #1836 (`preUpgrade: visible`), #1656 (separate packages).

## 1. Recommendation (read this first): NARROW

Of the four blocks in #1838, build two, record one as a recipe, and close one:

| Block | Verdict | Why |
| --- | --- | --- |
| Quote / testimonial | **Build** `pk-quote` | Real semantics (`figure > blockquote + figcaption`, `cite`) that nothing in the SDK produces; the portrait and rating are existing `pk-avatar` and read-only `pk-rating`. |
| CTA band | **Build** `pk-cta-band` | A full-bleed call-to-action surface with a heading, text and actions. `pk-alert banner` is a message, `pk-card` is a bounded panel; neither is this. |
| Logo strip | **Narrow**: no new element; a `pk-cluster` option or a documented recipe | It is a wrapping row of linked images with equal height. `pk-cluster` (wrapping row, fixed gap) plus `pk-media` / `img` already do the layout. The only new things are equal height and a greyscale filter. Adding an element for that is the "layout of existing elements" case the Composition rule warns about. See Q3. |
| Contact / address block | **Close** (recipe, not an element) | `<address>` plus `pk-field-list` (a titled `dt`/`dd` list that already stays visible before upgrade, `preUpgrade: visible`) is the block. Phone and email are plain `pk-link`/`<a href="tel:">`. The remaining part is prose that belongs in a guide, not a tag. See Q4. |

So the library gains two small elements, `pk-quote` and `pk-cta-band`, and a guide page ("Marketing sections") that shows all four blocks composed from existing elements. If the owner prefers the issue's four tags anyway, section 9 gives the cost.

## 2. Goals and non-goals

Goals:
- A server-rendered, JavaScript-optional site (the Shopify theme in #1838) can use the blocks with no hand-rolled theme CSS: tokens and `pk-*` only.
- Each block's light DOM is the real markup (`figure`, `blockquote`, `h2`, `a`) and reads correctly before upgrade or with JavaScript blocked.
- Phone first: every block is usable at 375 px with 44 px tap targets.

Non-goals:
- No carousel, auto-rotation or slider of quotes (a different element, with real a11y cost, not asked for).
- No new layout primitive: grids of quotes use `pk-grid`; rows of logos use `pk-cluster`.
- No data-driven `items` mode. These are authored content (a CMS writes the markup); an `items` array would duplicate it.
- No rating input: the quote shows a read-only rating through the existing `pk-rating`.

## 3. What exists today (re-verified on the integration branch)

- `pk-card` (tier `element`): bounded titled panel, `tone` is `default|error` only; no full-bleed, no brand surface.
- `pk-alert` (tier `element`): a message with kind, heading, actions, `banner` (full-bleed, top of page). A call to action in an alert is a misuse of `role="alert"`/status semantics, as #1838 says.
- `pk-avatar`: portrait (image or initials). `pk-rating` with `readonly`: compact stars.
- `pk-cluster`: wrapping row with a fixed gap. `pk-media`: image in an aspect-ratio box with a figure caption (a figure for an image, not for a quote).
- `pk-field-list` (component): `dt`/`dd` pairs, stays visible with JavaScript off. `pk-heading`, `pk-text`, `pk-link`, `pk-button`: the content parts.
- Nothing renders `blockquote`/`cite`, or a full-bleed brand call-to-action surface. Search of `core/dist/descriptions.json` for quote, testimonial, banner, cta, band gives only `pk-alert banner`.

## 4. Placement: core or an optional package (Q1)

Core `plainkit` is at 280,547 of 283,300 packed bytes (`core/tests/package-size.test.mjs`): about 2.7 KB of headroom, a one-way ratchet that branches never raise. Estimated cost, from the gzip size of comparable files (`card.element.js` 1.7 KB, `alert.element.js` 1.9 KB, `rating.element.js` 1.6 KB):

| Item | Packed estimate |
| --- | --- |
| `pk-quote` (css, html, js, meta) | 1.2 to 1.6 KB |
| `pk-cta-band` | 1.0 to 1.4 KB |
| Both | **2.2 to 3.0 KB: at or over the headroom** |

Options:
1. **Core, if it fits.** Land `pk-quote` first (it fits), measure `pk-cta-band` after; if it does not fit, offset it by an equal cut in core (the rule in AGENTS.md: relocate, do not raise). Cheapest for consumers (no extra install), but it uses the last headroom.
2. **A new extra `plainkit.site`** (`packages.json`, Blazor option `site`), `requires: ["plainkit"]`, ceiling set by the owner rule "measured + 1 %" on the integration tree. Gives marketing and static-site blocks a home (a later `pk-hero`, `pk-feature-grid` would go there instead of eating core). Cost: a new package pipeline entry (build, zip, manifest, `blazorOption`, tests in `scripts/tests/packages.test.mjs`), which is more work than the two elements.
3. **Do not ship; document recipes only.** Rejected: the semantic `blockquote` and the before-upgrade layout are the point of #1838.

Recommendation: option 1 for `pk-quote`; decide option 1 vs 2 for `pk-cta-band` from a measurement in slice 4 (owner question Q1). Do not create a package for two elements.

## 5. `pk-quote` (tier `element`, group Content)

Tier: `element`. It renders no `pk-*` itself (C4); the author slots `pk-avatar` and `pk-rating` in as children, which is allowed (slotted children are not rendered by the element). `meta.json`: `"preUpgrade": "visible"` (#1836), because the content is plain light-DOM markup.

Markup the author writes (works with no JavaScript; unknown tags are inline, the text is all there):

```html
<pk-quote cite="https://example.com/review/42">
  <blockquote><p>Fast delivery and the fit was perfect.</p></blockquote>
  <pk-avatar slot="portrait" name="Alex Roe"></pk-avatar>
  <span slot="name">Alex Roe</span>
  <span slot="role">Customer since 2023</span>
  <pk-rating slot="rating" readonly value="5" label="5 out of 5"></pk-rating>
</pk-quote>
```

Open question Q2: whether the element builds the `figure`/`figcaption` in its shadow tree around a slotted `blockquote`, or the author writes `figure` and the element only styles it through the host. Proposal: the shadow tree is `figure` (host role none) with `slot` for the quote and a `figcaption` holding the portrait, name, role and rating slots. Before upgrade the author's `blockquote` is simply shown; after, the figure and caption add semantics. The host never touches the author's nodes (Ownership rule 1).

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `cite` | string (URL) | none | Source URL. The element only reads it and renders a "source" link in the caption when set; the author's own `blockquote cite` is untouched. |
| `size` | `default` / `large` | `default` | Larger type for a lone hero quote. |

Slots: default (the `blockquote`), `portrait`, `name`, `role`, `rating`. Events: none (a static content element). CSS hooks: `--pk-quote-mark` (decorative opening mark colour), `--pk-quote-gap`, `::part(figure)`, `::part(caption)`.

a11y: `figure` with `figcaption`; the decorative quote mark is CSS `content` (not read); the portrait's accessible name comes from `pk-avatar`; the rating keeps its own label so the stars are spoken once. No hover-only information; colour contrast from tokens (>= 4.5:1 body, tested by the scorecard).

Phone first: one column, portrait left of name and role, wrapping under the text at 375 px; type from `--text-*`, gap from `--space-*`.

## 6. `pk-cta-band` (tier `element`)

Tier: `element` (no `pk-*` rendered; actions are slotted `pk-button`s). `"preUpgrade": "visible"`.

```html
<pk-cta-band tone="brand" align="center">
  <h2 slot="heading">Ready to start?</h2>
  <p>Free for 30 days. No card needed.</p>
  <span slot="actions"><pk-button href="/signup" variant="primary">Start free</pk-button><pk-button href="/demo">Book a demo</pk-button></span>
</pk-cta-band>
```

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `tone` | `neutral` / `brand` | `neutral` | The surface: `--color-surface-alt` or the accent surface with its on-colour text; both token pairs pass 4.5:1. |
| `align` | `start` / `center` | `start` | Text and actions alignment. |
| `bleed` | boolean | false | Full viewport width (the band escapes its container padding with the page gutter token; off by default so it also fits inside a column). |

Slots: `heading` (the author's own `h2`; the element never sets a level), default (text), `actions`. Events: none. A heading is required content: without a `heading` slot the band logs one `warnOnce` (no silent failure), it does not invent one. Before upgrade: heading, text and links stack as plain blocks (the actions span is inline), fully usable.

Phone first: actions stack full width under 640 px with 44 px targets (`--touch-target`), side by side above.

Why not `pk-card`/`pk-alert`: different semantics (see section 3), and `tone="brand"` is a surface `pk-card` should not grow.

## 7. Logo strip and contact block: the recipe alternative

Logo strip (Q3). Proposal: no tag. Add an `equal` boolean to `pk-cluster` is rejected (it makes a general layout primitive know about images). Preferred: a recipe in the guide, `pk-cluster` of `<a><img></a>` with the existing `pk-media` fixed-aspect box. A new utility class in `core/base/utilities.css` would cost page-layer budget (10 KB gzip, never raised), so the honest options are: (a) recipe plus the consumer's own `img` rule (not allowed by the Composition rule for a library site, allowed for a consumer theme), or (b) a `pk-logo-strip` element if the owner wants the greyscale and equal-height behaviour shipped. Estimated (b) at 0.6 to 0.8 KB packed. Recommendation: (a), revisit if a second consumer asks.

Contact block (Q4). Proposal: close. `<address>` is the one semantic piece, and `pk-field-list` already provides the `dt`/`dd` layout and the pre-upgrade visibility. A `pk-contact` with four named slots would add no behaviour, only slot names for what `pk-field-list` already lays out. Document the recipe (address, `tel:` and `mailto:` links, hours as a definition list) in the guide and the skills.

## 8. Static-markup (no JavaScript) behaviour, all blocks

Following "Static slotted pages (#1829)": the host's children are the content; the element never creates, moves, rewrites or sets attributes on them; the only thing it draws is inside its own shadow tree (figure, caption, band surface). With JavaScript blocked the tags are unknown inline elements and every word and link is present; with JavaScript the blocks lay out in place. Both set `preUpgrade: visible` so `base.css` does not hide them until defined. A late upgrade must not shift layout: each element gets a `:not(:defined)` rule that reserves the same box (the lesson of #1877: `pk-nav-item` shifted by 25 px until its pre-upgrade box matched), and a browser case measures it with the existing `?hold=<tag>` iframe harness.

## 9. Blazor, docs, skills, changelog

- Blazor: one mapping per element, `blazor/mappings/quote.json` and `cta-band.json` (props `Cite`, `Size`; `Tone`, `Align`, `Bleed`; named slots become `RenderFragment`s, wrapped in the `u-contents` span per Blazor rule 15). Generated components only, no hand-written file, so `handwritten.json` is unchanged. A `bUnit` render test per component through the existing generic generated-component tests.
- Docs and gallery: a gallery sample per element (resting; plus `tone` and `size`/`align` variants), and one guide page "Marketing sections" composing all four blocks (the two new elements, the logo recipe, the contact recipe).
- Skills: add both elements to the workflow lists in `scripts/skills/`, with the recipe for the two blocks that are not elements.
- Changelog: one `added` fragment per element (`node scripts/changelog.mjs new added quote --issue 1838`), plus a `notes` fragment for the recipes.
- If the issue's four tags are wanted anyway: add `pk-logo-strip` (about 0.7 KB) and `pk-contact` (about 0.6 KB), which breaks the core headroom for certain and makes the extra `plainkit.site` mandatory.

## 10. Test plan

- Node: `core/elements/<name>/<name>.test.mjs` per element: props reflect, slots exist, no attribute written on slotted children (a snapshot of `innerHTML` before and after upgrade), missing `heading` slot logs once. `core/tests/elements.test.mjs`, `tiers`, `ownership`, `element-surface` guards pass unedited.
- Browser (`core/tests/browser/cases-marketing.js`), written before the CSS, each layout expectation a measurement: the quote's portrait and name share a row at 375 px and wrap under the text without overflow; the band's actions are full width under 640 px and 44 px high; `bleed` reaches both viewport edges; pre-upgrade versus upgraded rects differ by less than 1.5 px (layout shift); the author's markup is unchanged after upgrade.
- UI review and scenarios: `node scripts/ui-review.mjs --elements quote,cta-band`; a scenario `marketing-sections` with a quote grid and a band at phone width in light and dark; open every screenshot.
- Blazor: the generated component tests plus `node scripts/blazor-browser.mjs --changed` only if the sample page is touched.
- Budgets: `node scripts/verify.mjs --changed --pack`, and the package-size test, on the integration tree.

## 11. Open questions for the owner

1. **Placement (Q1).** Core (uses the last 2.7 KB of headroom, may need an equal cut elsewhere) or a new extra `plainkit.site` (more pipeline work, room to grow)?
2. **Quote structure (Q2).** Shadow `figure` around a slotted `blockquote` (proposed), or author-written `figure` that the element only styles?
3. **Logo strip (Q3).** Recipe only (proposed), or a `pk-logo-strip` element?
4. **Contact block (Q4).** Close as a recipe (proposed), or a `pk-contact` element?
5. **Brand surface.** Is `tone="brand"` on the band acceptable, or should the band be neutral-only with the consumer choosing the surface token?
6. **Naming.** `pk-quote` collides in spirit with `pk-markdown` blockquotes; keep the name, or `pk-testimonial`?

## 12. Slice plan (each under 400 hand-written lines, each leaves `main` releasable)

1. **`pk-quote` browser cases and meta** (about 150 lines): `meta.json`, `quote.html`, minimal CSS, the layout and no-JS cases written first; gallery sample. Changelog `added`.
2. **`pk-quote` Blazor mapping, docs, skills** (about 120 lines): `blazor/mappings/quote.json`, the guide stub, skills entry, a UI-review scenario.
3. **Measure and decide placement** (about 30 lines plus the owner decision): run the packed-size measurement for slice 1 on the integration tree; answer Q1.
4. **`pk-cta-band`** (about 250 lines): cases first (full width, stacking actions, upgrade shift), element, gallery, changelog; in core or `plainkit.site` per Q1.
5. **`pk-cta-band` Blazor mapping and the "Marketing sections" guide** (about 200 lines): mapping, the full guide with the logo strip and contact recipes, skills text, `notes` fragment.

Each slice runs `node scripts/verify.mjs --changed --browser`, and the UI review for slices that change how something looks.
