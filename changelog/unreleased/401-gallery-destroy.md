---
type: changed
issue: 401
---
`mountGallery` resolves with `{ destroy() }`: it ends the gallery's router, its document events and its sample frames and empties the container, and mounting a gallery again ends the one already on show instead of stacking a second set of listeners on it.
