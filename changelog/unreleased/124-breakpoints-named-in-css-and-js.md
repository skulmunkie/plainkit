---
type: changed
issue: 124
---
Every element now names its breakpoints (`@media (--phone)`, `(--tablet)`, `(--wide)`) and scripts read them through the new `js/breakpoints.js` (`mediaBelow('phone')`, from `--pk-bp-*` on `:root`) instead of repeating pixel literals; the built media conditions are unchanged except two recorded ones. `pk-form-section` now switches to its two-column layout above 1024px (was at 1024px and above, so it overlapped the tablet band for one pixel), and `pk-grid`'s range condition now reads `(max-width: 640px)`, the same query. The SDK's own gallery and guides pages compact their bar below 1280px (was 1100px).
