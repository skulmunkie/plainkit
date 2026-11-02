---
type: added
issue: 1841
---
`pk-nav-item` accepts an author-written `<a href>` child as its link: it works as a plain link without JavaScript, and once the element is defined it is styled and stretched over the row (the element never changes the anchor; set `aria-current` on it and `current` on the row). The `href` attribute path is unchanged. With JavaScript blocked or not yet loaded the anchor stays visible and usable (the page layer no longer hides it with the un-upgraded element). `PkNavItem` takes the same anchor in `ChildContent`; the Blazor guide and skill show how to write a no-JavaScript nav as a native list.
