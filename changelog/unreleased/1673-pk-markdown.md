---
type: added
issue: 1673
---
`pk-markdown` (Blazor `PkMarkdown`): a read-only view of Markdown (`markdown`, `Markdown` in Blazor), drawn by the toolkit's own parser and renderer with DOM nodes only, so an app no longer puts rendered HTML on the page with `MarkupString`. Raw HTML in the source is shown as text. A click on a relative link raises `pk-link-click` (`OnLinkClick`); `interceptLinks` (`InterceptLinks`) cancels the navigation so the app routes or rewrites it. It renders the Markdown subset `pk-markdown-editor` writes; showing HTML you sanitised yourself is not part of it.
