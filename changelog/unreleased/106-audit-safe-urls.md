---
type: fixed
issue: 106
---
`pk-button`, `pk-card`, `pk-stat` and `pk-nav-item` no longer put a script address (a `javascript:` or `data:` value, however it is spelled with case, spaces, tabs or newlines) into a link's `href`, and `pk-gallery` ignores a `src` that is not a same-site path or http(s); a dropped address is reported once in the SDK log. `mailto:`, `tel:` and `sms:` links still work. The menu, command palette and app shell checks, and the image sources of `pk-image-gallery` and `pk-lightbox`, read the scheme the way the browser does, so `java` + newline + `script:` no longer passes them.
