---
type: added
issue: 2012
---
`pk-markdown` renders a documentation page: pipe tables (with column alignment, scrolling sideways inside the element), images, headings 4 to 6, a slug `id` on every heading (a `#anchor` link scrolls to it), a `baseUrl` property (Blazor `BaseUrl`) that resolves relative links and images so the DOM carries the final address, and a `pk-markdown-render` event with the content root so a page can replace diagram fences. Inline HTML stays text. Part of `plainkit.markdown`.
