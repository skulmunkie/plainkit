---
type: fixed
issue: 688
---
The shipped `plainkit.css`/`plainkit.min.css` no longer defines a dozen dead custom properties (`--maint-section-header-*`, `--dg-filter-popup-shadow`, `--u-c-888`, `--gal-actions-bg`, `--remedy-*`, `--combo-popup-shadow`, `--tag-pill-x-*`, `--tag-pill-fg`) at its top-level `:root`; they were leftovers from before PlainKit's app stylesheet became components, unread anywhere in the source tree, and looked like real design tokens with no documentation to say otherwise.
