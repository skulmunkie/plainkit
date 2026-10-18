---
type: fixed
issue: 1533
---
`pk-app-frame` no longer shifts the page when its inner shell upgrades a moment after the frame: until then the shell holds the screen and shows nothing, instead of stacking the bar, side nav and breadcrumb unstyled above the page (a layout shift of about 0.2 on a slow device).
