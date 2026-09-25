---
type: fixed
issue: 297
---
`pk-side-nav` hides its brand in the icon rail again when the brand sits in a Blazor slot wrapper (`<span slot="brand" class="u-contents">`): the rail now hides the brand `<slot>` itself, so the page's `.u-contents { display: contents !important }` no longer keeps the brand visible and pushes the collapse caret out of the rail. A new test fails for any element rule that hides a named-slot node through `::slotted`.
