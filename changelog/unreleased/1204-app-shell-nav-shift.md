---
type: fixed
issue: 1204
---
On a phone or tablet, `pk-app-shell` no longer pushes the page down and then pulls it back up while its `pk-side-nav` is still loading: an undefined side nav takes no room, so the first load no longer shifts the layout (layout shift on a 375px gallery page went from about 0.47 to under 0.01).
