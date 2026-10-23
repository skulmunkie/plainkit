---
type: fixed
issue: 1753
---
On a phone, a `pk-table` row link and an editable cell are 44px tall, and a narrow `pk-input` (width `xs`) keeps a 44px wide control. The UI review now measures an invisible `::before`/`::after` hit layer as part of a tap target (the `pk-badge-popover` pill), so it no longer warns for it.
