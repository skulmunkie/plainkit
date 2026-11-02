---
type: added
issue: 1829
---
`pk-doc-page` has a static slotted mode for server-rendered, JavaScript-optional sites: when its markup has child elements and `config` has no items, it builds nothing and moves nothing, and your `pk-side-nav` (slot `nav`), `pk-toc` (slot `aside`), article and `pk-pager` render as you wrote them. The current item is the one you mark in the markup (`aria-current="page"` on a link, or `current` on a `pk-nav-item`); the page never decides it. This is the shared convention for static pages (slotted content as given, host-owned light DOM never created, moved or changed by the element, current item read from markup), which `pk-master-detail-page` will follow. Refs #1829.
