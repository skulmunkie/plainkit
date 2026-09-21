---
type: added
issue: 107
---
The theme editor's Export / import tab has a copy-paste snippet (the `:root` and `[data-theme]` override blocks with a header, to save as `theme.css`) and a shareable link: "Create link" puts the edits in the link fragment (`#pk-theme=z.…`, deflate-compressed where the browser has `CompressionStream`, plain otherwise, at most 4096 characters), and pasting a link, or opening the theme page with one (`readHash: true`), applies it as ordinary edits that Undo takes back. A link is text only: it is read with the same rules as pasted JSON (names and values checked one by one, no `url()`, no markup), refused when it is too large or expands past a cap, and never reaches an HTML sink. From code: `editor.share()` and `editor.importShare(text)`. The pure logic is `js/theme-share-logic.js` (`buildSnippet`, `encodeShare`, `decodeShare`).
