---
type: added
issue: 47
---
pk-menu-item raises pk-submenu-toggle (detail.open) when it opens or closes its own submenu, and names it as the commit event of open; pk-table now names pk-select as the commit event of selected. Both props leave the ownership exception list, and PkMenuItem gains @bind-Open.
