---
type: fixed
issue: 1151
---
The site app's Gallery, Theme editor and Dev tools pages load the elements their views draw after the app's first scan, so a cold deep link such as `app.html#/gallery/elements/pk-button` no longer leaves `pk-container`, `pk-page-header`, `pk-card` and `pk-table` undefined and unstyled; the Gallery holds its first view back until its elements are defined.
