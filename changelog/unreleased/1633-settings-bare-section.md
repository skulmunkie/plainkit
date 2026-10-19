---
type: added
issue: 1633
---
A settings page section can be marked bare (`bare: true` in `config.sections`; Blazor `PkSettingsPage` Config): it draws no wrapping card and no heading, so a `SectionContent` fragment that draws its own `PkCard`s no longer ends up as a card inside a card. The section keeps its nav item and tab, and the save bar and Discard still cover its fields and slotted controls.
