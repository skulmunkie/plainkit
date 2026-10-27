---
type: fixed
issue: 1811
---
A `data-open` or `data-toggle` link (`<a href="/cart" data-open="#cart">`) now opens its pk-drawer, pk-dialog or pk-popover without also following the link once the overlay element is defined; with JavaScript blocked or the element not loaded it stays a plain link, so progressive enhancement needs no click handler.
