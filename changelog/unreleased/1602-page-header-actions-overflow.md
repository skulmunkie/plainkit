---
type: added
issue: 1602
---
pk-page-header takes `actions-overflow` (`phone`, `tablet` or `always`; Blazor `ActionsOverflow`, plus `overflow-label`): at that width the slotted actions fold into one icon button that opens a menu, each item keeping its label, icon and disabled state and clicking the original action, so the title bar stays one row high on a phone without app CSS.
