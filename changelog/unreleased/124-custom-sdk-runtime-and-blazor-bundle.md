---
type: added
issue: 124
---
`applyBreakpointClasses` (js/breakpoint-classes.js) applies the `data-show-above` and `data-hide-above` classes of breakpoints of your own at run time, from the list or from `plainkit.custom.json`, and `PkThemeEditor` raises `OnBundleExported` with the Custom SDK zip so a Blazor app can save it; the guide shows serving a custom `dist` through the static web assets override.
