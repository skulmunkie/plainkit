---
type: added
issue: 728
---
`pk-card-menu` (tier component) is the "..." or settings button of a card header: a `pk-dropdown` opened by an icon-only `pk-button`, with `label`, `icon-name` (default `more`), `placement` (default `bottom-end`) and a two-way `open`; put it in the `actions` slot of a `pk-card` with `pk-menu-item` children. The dropdown's keyboard, placement and focus return come through it, and `pk-select`, `pk-open` and `pk-close` reach the element.
