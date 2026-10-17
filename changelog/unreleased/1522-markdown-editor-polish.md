---
type: added
issue: 1522
---
`pk-markdown-editor` gets heading and quote toolbar buttons (now in the default `toolbar`; the row wraps on a phone), Enter at the end of a list item starts the next item (and ends the list on an empty one), and pasting an http, https or mailto address over selected text makes it a link. The new code is in the lazy Markdown chunk. The Blazor lab sample and harness cover `PkMarkdownEditor` with `@bind-Value`.
