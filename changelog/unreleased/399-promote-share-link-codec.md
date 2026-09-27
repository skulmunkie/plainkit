---
type: added
issue: 399
---
The theme editor's shareable-link codec is now a core utility, `js/share-link.js` (`encodeShareLink`/`decodeShareLink`): pack any JSON-safe payload into a compact, size-capped, URL-fragment-safe link (deflate-raw when the platform supports it, plain base64url otherwise), and unpack it back with the same caps. `theme-share-logic.js`'s `encodeShare`/`decodeShare` are now thin glue on top of it, supplying only the theme payload shape and `readImport` validation.
