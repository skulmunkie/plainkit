---
type: fixed
issue: 106
---
The thumbnails of `pk-image-gallery` load lazily (`loading="lazy"`, `decoding="async"`), so a gallery of hundreds of images no longer fetches them all at once.
