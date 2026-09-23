---
type: fixed
issue: 211
---
A Blazor component's generated wrapper for a multi-root `RenderFragment` in a named slot (`<span slot="...">`, needed because Razor cannot put a `slot` attribute on several sibling root elements from one fragment) is now `display: contents`, so it no longer breaks out of a shell's flex or grid layout of its slotted content. Every hand-written component with the same wrapper (`PkCard`, `PkEmptyState`, `PkPageHeader`, `PkSideNav`, `PkStat`, `PkTable`) gets it too.
