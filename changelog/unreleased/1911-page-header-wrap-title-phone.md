---
type: changed
issue: 1911
---
A `pk-page-header` record with `wrap-title` (Blazor `WrapTitle`) now clamps its title to two lines on a phone (a container of 30rem or less) instead of three, so the title beside the actions no longer takes most of the first screen; a wider narrow container keeps three, and wide screens keep the one line. The docs say that a tab strip in the header scrolls with a fade (`pk-tabs` overflow `scroll`, the default) or lists its tabs in a menu (`overflow="menu"`).
