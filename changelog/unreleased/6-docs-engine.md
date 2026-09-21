---
type: added
issue: 6
---
The Guides page is a real documentation engine (first slice): guides are Markdown files in `core/site/guides/content/` (front matter `title`, `order`, `summary`) that the build converts with a small dependency-free converter (`core/tools/markdown.mjs`: headings with stable ids and permalinks, lists, tables, code blocks as `pk-code-block`, quotes as `pk-alert`, no raw HTML) into `site/guides/guides.data.js` (generated, not in git). The page has a side nav of guides (a drawer on a phone), a breadcrumb, a table of contents, previous and next links and deep links (`#/<guide>/<heading>`), all built from existing elements. Four guides ship: getting started with the SDK and with Blazor, theming and tokens, and logging; every code sample in them is checked against the SDK and Blazor API by `scripts/tests/guides.test.mjs`. Search is not part of this slice.
