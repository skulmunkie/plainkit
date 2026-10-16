---
type: added
issue: 334
---
`pk-settings-page` draws a section nav beside the cards: a sticky list of the sections that scrolls to one, moves focus onto it and marks the one in view with `aria-current`. It is automatic from three sections (`config.nav`: `true`, `false` or `'auto'`, the default; a section's optional `key` is its anchor), and on a phone it gives way to `pk-detail-layout`'s tab strip, one section at a time. Unsaved edits survive switching sections. Pages with fewer than three sections look as before. In Blazor it is the same `Config` JSON of `PkSettingsPage`.
