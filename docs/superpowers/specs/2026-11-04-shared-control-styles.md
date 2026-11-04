# Shared control styles: spike findings (#1644, lever 8)

Status: spike done, recommendation NO-GO as a size lever. Date: 2026-11-04.

## Question

Owner decision 3 approved, in principle, one shared constructable stylesheet for the control CSS repeated across elements (focus ring, `--_bg` plumbing, hover rules), on the theory of up to 2.4 KB gzip saved. The spike gates the rollout on real numbers.

## 1. What is really repeated

Scripted over `core/elements/*/*.css` (100 files, 72.7 KB gzip summed per file, 36.6 KB concatenated). Declaration blocks (at least 25 chars) that appear in two or more elements add up to about 15 KB raw across the whole catalogue. The biggest, by elements repeating them:

| Block | Elements |
| --- | ---: |
| `outline: var(--focus-ring); outline-offset: 2px` | 24 |
| `outline: var(--focus-ring); outline-offset: -2px` | 19 |
| `background: var(--color-surface-alt)` | 20 |
| `min-height: var(--touch-target)` | 15 |
| `color: var(--color-muted)` | 11 |
| `--_bd: var(--field-error)` | 10 |
| `opacity: .55; cursor: not-allowed`, `border-color: var(--color-muted)` | 9 each |
| field row (`position: relative; display: flex; ...`, 309 B) | 5 (combobox, input, select, tag-input, textarea) |
| field inner control (206 B) | 4 |

Most blocks are 25 to 50 bytes. The `--_bg` variant plumbing is not repeated in this sense: `--_bg`, `--_bg-hover`, `--_fg` are set per variant with different `--pk-<element>-*` hooks, so each element's lines differ. Only the field family (combobox, input, select, tag-input, textarea, unit-input) shares bigger blocks.

## 2. Constraints

- CSP: fine. The base already adopts constructable sheets (`sheetFor` in `core/js/element.js`, `root.adoptedStyleSheets = [sheetFor(RESET), sheetFor(c.css)]`, cached per CSS string); no `<style>`, no inline style.
- Ownership: the element owns its shadow tree, so a shared sheet must be adopted by the element (a third entry in that array). That needs either a base-class change (a `static sharedCss` hook: forbidden, "no new base-class hooks", `ownership.test.mjs` and `element-surface.test.mjs`) or elements composing their own `static css` from an imported string, which shares bytes on the wire but not the sheet.
- Selectors: a shared sheet cannot style `[part="control"]:focus-visible` of 24 different templates unless every element uses the same part and class names; the repeated blocks are shared, the selectors that carry them are not. Either the shared sheet carries a selector list for every element (it grows with the catalogue and a page pays for elements it does not use) or elements are re-marked up (visual risk on 100 files).
- No-build, per-element path: the shared sheet is one more module (one more request, a round trip deeper) imported by every element file; it cannot be inlined without losing the sharing.
- Prerender and Blazor: elements are not declaratively rendered; before upgrade the host is an unstyled inline element (the FOUC guard in `plainkit.css` hides `:not(:defined)`), so a shared sheet changes nothing there. It would be adopted at construction like the others.

## 3. Measured, not theoretical

The 2.4 KB figure is the gap between summed and concatenated gzip. Most of that gap is shared vocabulary (token names, property names, selectors), which a shared sheet does not remove. An upper-bound model for a shared sheet: take every declaration block that occurs in at least two elements of the set, move it once into a shared sheet together with its selector, leave the selector (empty rule) in the element, and gzip both. This is generous: real elements would also need an adopt line and an import.

| Set | Per-file gzip / brotli today | With shared sheet (upper bound), gzip / brotli | Change |
| --- | --- | --- | --- |
| button, input, select | 3,486 / 2,951 | 3,628 / 3,050 | +142 / +99 (worse) |
| bench page, 8 elements | 9,049 / 7,647 | 9,424 / 7,947 | +375 / +300 (worse) |
| all 100 elements, summed | 72,641 / 59,911 | 70,836 / 58,575 | -1,805 / -1,336, but a page loads a handful, not all |

On the bundle path nothing is gained: one gzip stream already deduplicates these blocks (concatenation is where the 36.6 KB comes from). On the per-element path the shared module is an extra request whose own cost is not in the table. gzip already deduplicates repeated blocks inside one file; extracting them only pays when many elements load on one page and the extracted blocks are long. The blocks here are short.

The prototype on button, input and select was therefore not built: the model shows a loss for those three, and a prototype could not turn it into a win without changing selectors on the elements, which carries visual risk for no size gain. No page-weight or bench numbers moved; no code changed.

## 4. Recommendation

NO-GO on a shared sheet as a size lever. Cheaper options that do not touch the base class:

1. Where a family really shares large blocks (the field family: combobox, input, select, tag-input, textarea, unit-input, the 309 B row and 206 B inner control), export one CSS string constant from one helper module that those elements already import (input helpers), used inside `static css`. Estimated saving is under 0.3 KB gzip on a page that loads two of them; measure with `node bench/size-comparison/run.mjs` before any rollout. Only worth it if a measured saving is at least 0.5 KB on the bench page.
2. Spend the effort on the levers that measured well (#1644: bundle splitting, dialog logic split, shared core module for the per-element path).

If the owner still wants the shared sheet for consistency (one focus ring definition), do it as a maintainability change, not a size one, in slices under 400 lines: (a) the focus-ring and disabled blocks for the six field elements; (b) the same for the controls (button, checkbox, radio-group, switch); (c) the rest. Each slice needs the UI review for its elements and a bench run showing no loss.
