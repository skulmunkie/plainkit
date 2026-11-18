---
type: added
issue: 2011
---
pk-wizard-page raises pk-wizard-change for each committed answer (so an app can autosave a draft), config.footerActions adds buttons such as Save draft and Discard to every step (pk-wizard-action), and config.submitEarly adds a Submit before the last step. Blazor: PkWizardPage OnChange and OnFooterAction.
