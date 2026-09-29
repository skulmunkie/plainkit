---
type: breaking
issue: 648
---
`PkPageHeader`'s `ShellSection` parameter is removed, along with the `SectionContent`/`SectionOutlet` wiring it used to write the title into the app shell's top bar. `pk-app-shell` has no title slot to write into any more (app space has no title concept, only page space does): the page header always draws its own title in the page body. `BackLink` now always draws its back anchor just above the header (its former "inside the shell section outlet" placement mode is gone).
