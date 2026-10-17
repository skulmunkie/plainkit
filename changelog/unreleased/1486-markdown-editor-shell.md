---
type: added
issue: 1486
---
`pk-markdown-editor` is a form field for writing Markdown: a real textarea whose value is the Markdown text, a formatting toolbar (bold, italic, lists, link) with keyboard shortcuts, and a Write / Preview switch (or a side-by-side `layout="split"` on wide fields). The preview is built from the parsed text with DOM calls only, so raw HTML shows as text and `javascript:` links are refused. The parser loads on first use. Blazor gets `PkMarkdownEditor` with `@bind-Value`.
