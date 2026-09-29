---
type: fixed
issue: 308
---
Confirmed `pk-app-shell` with nothing in its `nav` slot fills the full width: the main column is always the grid's last track (`grid-column: -2 / -1`), so the header, body and footer span the window instead of shrinking to their content. Covered by the `app-shell-layout` review scenario and a browser case (`cases-navbar.js`) at 1280 and 1500px.
