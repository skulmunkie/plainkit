---
type: fixed
issue: 643
---
PkPageHeader no longer forces a duplicate title next to the last breadcrumb crumb when Title is left unset (a record page with no ShellSection renders single-row again, matching the vanilla SDK); the last crumb now carries role="heading" itself in that case.
