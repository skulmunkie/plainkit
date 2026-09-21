---
title: Responsive design and breakpoints
order: 4
summary: The three named breakpoints (phone, tablet, wide), what the elements already do at each, how to respond in your own CSS and scripts, and how a different set is built.
---

Plainkit responds to the screen in two places: the elements change their own layout, and the page layer changes a few tokens. Both happen at the same three named widths, and the SDK is desktop-first: a rule for a breakpoint applies at that width and below. You rarely need to do anything, and when you do, you use the same names.

## The three breakpoints

| Name | Width | Typical device |
|---|---|---|
| `phone` | 640px | a phone, portrait or landscape |
| `tablet` | 1024px | a tablet, or a small laptop window |
| `wide` | 1280px | a laptop window; anything bigger has the full layout |

The widths live in one file, `core/tokens/breakpoints.json`. `plainkit.css` also writes them as custom properties on `:root` (`--pk-bp-phone`, `--pk-bp-tablet` and `--pk-bp-wide`), so a script or a page can read them.

## What the elements do

The elements already respond; you do not restyle them at these widths.

- **At or below `phone`:** controls grow to the touch size (44px), `pk-dialog` fills the screen, a docked `pk-drawer` becomes a bottom sheet, the toast stack spans the width, a `pk-table` with `cards` drops its header row and shows each row as a card, the page gutter narrows and secondary text (`--text-meta`) grows to 13px.
- **At or below `tablet`:** `pk-side-nav` becomes an off-canvas drawer, `pk-app-shell` collapses to one column, `pk-navbar` folds its links behind a toggle button, `pk-toc` stops sticking and the `pk-workspace` aside overlays the content.
- **At or below `wide`:** `pk-workspace` narrows its navigation column.
- **Above `tablet`:** `pk-form-section` puts its heading beside its fields.

The full list, element by element with the selectors and properties that change, is generated with the SDK: `dist/breakpoints.report.json`, or as a table with `node core/tools/breakpoint-report.mjs` in a checkout.

## In your own CSS

A CSS variable cannot be used inside `@media`, so in your own stylesheet write the literal query with the same width, and say which breakpoint it is in a comment:

```css
/* phone: 640px */
@media (max-width: 640px) {
    .toolbar { flex-direction: column; }
}

/* above tablet: 1024px + 1 */
@media (min-width: 1025px) {
    .layout { grid-template-columns: 16rem 1fr; }
}
```

Use `max-width` for "this width and below" and `min-width` one pixel above the breakpoint for "wider than". Do not restyle an element at these widths: use its `--pk-*` hooks or a token instead, so it keeps responding on its own.

## In a script

Never write the number. `js/breakpoints.js` reads the width from the page, so your script and the CSS cannot disagree:

```js
import { mediaBelow, breakpoint } from './plainkit/js/breakpoints.js';

const phone = mediaBelow('phone');          // a MediaQueryList for (max-width: 640px)
if (phone.matches) { /* compact behaviour */ }
phone.addEventListener('change', event => setCompact(event.matches));

const tabletWidth = breakpoint('tablet');    // 1024
```

`mediaAbove(name)` is the complement, and `belowQuery(name)` and `aboveQuery(name)` return the query text. When the page does not define `--pk-bp-*` (it did not load `plainkit.css`) the default width is used and one debug line says so; see [Logging](logging.md).

## Different breakpoints

The widths are resolved when the SDK is built, because an element's CSS is compiled into its module and a `@media` condition cannot read a variable. A prebuilt `dist` (the release zip, the NuGet package, the Pages site) therefore has these three widths. To change them, edit `core/tokens/breakpoints.json` in a checkout and run `node scripts/bootstrap.mjs`: every element, `--pk-bp-*` and the report follow (the tests then point at the few places that repeat a width, such as the site's own stylesheets). An export of a customised `dist` from the theme editor is planned.

Inside the SDK's own element CSS the breakpoints are written as names, `@media (--phone)` for at or below and `@media (--above-phone)` for above, and a combined form such as `(--phone) and (orientation: portrait)` works. Only element CSS can use them: the build resolves them, and an unknown name fails the build. See [Theming and tokens](theming.md) for the rest of the tokens.
