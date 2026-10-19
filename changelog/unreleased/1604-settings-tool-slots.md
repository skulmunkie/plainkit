---
type: added
issue: 1604
---
`pk-settings-page` shows your own content in a section through a `section-<key>` slot (`PkSettingsPage` `SectionContent`, keyed by the section key): it sits inside that section's card after its fields, so the section nav and the save bar cover it. `pk-tool-page` takes its default slot (`PkToolPage` `ChildContent`) in place of the generated input fields, Run button and outcome.
