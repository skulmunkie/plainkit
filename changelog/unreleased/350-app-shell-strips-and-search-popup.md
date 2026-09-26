---
type: fixed
issue: 350
---
`pk-app-shell` with nothing in its nav slot no longer squeezes the page into the width of its content: the main column is always the last column. A header or footer strip with nothing in it is no longer drawn (the old rule used a selector no browser supports, so the empty strips always showed). `pk-app-bar-search` opens its results towards the start when the field is near the right edge of the window, so the panel no longer runs off the screen and makes the page scroll sideways.
