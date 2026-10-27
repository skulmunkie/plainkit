---
type: fixed
issue: 1803
---
pk-settings-page (and `PkSettingsPage`) shows the unsaved-changes bar for an edit in your own section content (`slot="section-<key>"`, `SectionContent`), including a `pk-field-group` there; before, only the generated fields could mark the page changed. Discard and a successful save hide the bar; the values of your own content stay yours.
